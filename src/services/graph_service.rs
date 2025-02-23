use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::{HashMap, HashSet};
use actix_web::web;
use rand::Rng;
use std::io::{Error, ErrorKind};
use serde_json;
use std::pin::Pin;
use futures::Future;
use log::{info, warn, error};

use crate::models::graph::GraphData;
use crate::utils::socket_flow_messages::Node;
use crate::models::edge::Edge;
use crate::models::metadata::MetadataStore;
use crate::app_state::AppState;
use crate::config::Settings;
use crate::utils::gpu_compute::GPUCompute;
use crate::models::simulation_params::{SimulationParams, SimulationPhase, SimulationMode};
use crate::models::pagination::PaginatedGraphData;

#[derive(Clone)]
pub struct GraphService {
    graph_data: Arc<RwLock<GraphData>>,
    node_map: Arc<RwLock<HashMap<String, Node>>>,
    gpu_compute: Option<Arc<RwLock<GPUCompute>>>,
}

impl GraphService {
    pub async fn new(settings: Arc<RwLock<Settings>>, gpu_compute: Option<Arc<RwLock<GPUCompute>>>) -> Self {
        // Get physics settings
        let physics_settings = settings.read().await.visualization.physics.clone();
        let node_map = Arc::new(RwLock::new(HashMap::new()));
        
        let graph_service = Self {
            graph_data: Arc::new(RwLock::new(GraphData::default())),
            node_map: node_map.clone(),
            gpu_compute,
        };
        
        // Start simulation loop
        let graph_data = Arc::clone(&graph_service.graph_data);
        let gpu_compute = graph_service.gpu_compute.clone();
        
        tokio::spawn(async move {
            let params = SimulationParams {
                iterations: physics_settings.iterations,
                spring_strength: physics_settings.spring_strength,
                repulsion: physics_settings.repulsion_strength,
                damping: physics_settings.damping,
                max_repulsion_distance: physics_settings.repulsion_distance,
                viewport_bounds: physics_settings.bounds_size,
                mass_scale: physics_settings.mass_scale,
                boundary_damping: physics_settings.boundary_damping,
                enable_bounds: physics_settings.enable_bounds,
                time_step: 0.016,  // ~60fps
                phase: SimulationPhase::Dynamic,
                mode: SimulationMode::Remote,
            };

            loop {
                // Update positions
                let mut graph = graph_data.write().await;
                let mut node_map = node_map.write().await;
                if physics_settings.enabled {
                    if let Some(gpu) = &gpu_compute {
                        if let Err(e) = Self::calculate_layout(gpu, &mut graph, &mut node_map, &params).await {
                            warn!("[Graph] Error updating positions: {}", e);
                        }
                    }
                }
                drop(graph); // Release locks
                drop(node_map);

                // Sleep for ~16ms (60fps)
                tokio::time::sleep(tokio::time::Duration::from_millis(16)).await;
            }
        });

        graph_service
    }

    pub async fn build_graph_from_metadata(metadata: &MetadataStore) -> Result<GraphData, Box<dyn std::error::Error + Send + Sync>> {
        let mut graph = GraphData::new();
        let mut edge_map = HashMap::new();
        let mut node_map = HashMap::new();

        // First pass: Create nodes from files in metadata
        let mut valid_nodes = HashSet::new();
        for file_name in metadata.keys() {
            let node_id = file_name.trim_end_matches(".md").to_string();
            valid_nodes.insert(node_id);
        }

        // Create nodes for all valid node IDs
        for node_id in &valid_nodes {
            let mut node = Node::new(node_id.clone());
            
            // Get metadata for this node
            if let Some(metadata) = metadata.get(&format!("{}.md", node_id)) {
                node.set_file_size(metadata.file_size as u64);  // This will update both file_size and mass
                node.size = Some(metadata.node_size as f32);
                node.label = node_id.clone(); // Set label to node ID (filename without .md)
                
                // Add metadata fields to node's metadata map
                node.metadata.insert("fileSize".to_string(), metadata.file_size.to_string());
                node.metadata.insert("hyperlinkCount".to_string(), metadata.hyperlink_count.to_string());
                node.metadata.insert("lastModified".to_string(), metadata.last_modified.to_string());
            }
            
            let node_clone = node.clone();
            graph.nodes.push(node_clone);
            node_map.insert(node_id.clone(), node);
        }

        // Store metadata in graph
        graph.metadata = metadata.clone();

        // Second pass: Create edges from topic counts
        for (source_file, metadata) in metadata.iter() {
            let source_id = source_file.trim_end_matches(".md").to_string();
            
            for (target_file, count) in &metadata.topic_counts {
                let target_id = target_file.trim_end_matches(".md").to_string();
                
                // Only create edge if both nodes exist and they're different
                if source_id != target_id && valid_nodes.contains(&target_id) {
                    let edge_key = if source_id < target_id {
                        (source_id.clone(), target_id.clone())
                    } else {
                        (target_id.clone(), source_id.clone())
                    };

                    edge_map.entry(edge_key)
                        .and_modify(|weight| *weight += *count as f32)
                        .or_insert(*count as f32);
                }
            }
        }

        // Convert edge map to edges
        graph.edges = edge_map.into_iter()
            .map(|((source, target), weight)| {
                Edge::new(source, target, weight)
            })
            .collect();

        // Initialize random positions
        Self::initialize_random_positions(&mut graph);

        info!("Built graph with {} nodes and {} edges", graph.nodes.len(), graph.edges.len());
        Ok(graph)
    }

    pub async fn build_graph(state: &web::Data<AppState>) -> Result<GraphData, Box<dyn std::error::Error + Send + Sync>> {
        let current_graph = state.graph_service.get_graph_data_mut().await;
        let mut graph = GraphData::new();
        let mut node_map = HashMap::new();

        // Copy metadata from current graph
        graph.metadata = current_graph.metadata.clone();

        let mut edge_map = HashMap::new();

        // Create nodes from metadata entries
        let mut valid_nodes = HashSet::new();
        for file_name in graph.metadata.keys() {
            let node_id = file_name.trim_end_matches(".md").to_string();
            valid_nodes.insert(node_id);
        }

        // Create nodes for all valid node IDs
        for node_id in &valid_nodes {
            let mut node = Node::new(node_id.clone());
            
            // Get metadata for this node
            if let Some(metadata) = graph.metadata.get(&format!("{}.md", node_id)) {
                node.set_file_size(metadata.file_size as u64);  // This will update both file_size and mass
                node.size = Some(metadata.node_size as f32);
                node.label = node_id.clone(); // Set label to node ID (filename without .md)
                
                // Add metadata fields to node's metadata map
                node.metadata.insert("fileSize".to_string(), metadata.file_size.to_string());
                node.metadata.insert("hyperlinkCount".to_string(), metadata.hyperlink_count.to_string());
                node.metadata.insert("lastModified".to_string(), metadata.last_modified.to_string());
            }
            
            let node_clone = node.clone();
            graph.nodes.push(node_clone);
            node_map.insert(node_id.clone(), node);
        }

        // Create edges from metadata topic counts
        for (source_file, metadata) in graph.metadata.iter() {
            let source_id = source_file.trim_end_matches(".md").to_string();
            
            // Process outbound links from this file to other topics
            for (target_file, count) in &metadata.topic_counts {
                let target_id = target_file.trim_end_matches(".md").to_string();
                
                // Only create edge if both nodes exist and they're different
                if source_id != target_id && valid_nodes.contains(&target_id) {
                    let edge_key = if source_id < target_id {
                        (source_id.clone(), target_id.clone())
                    } else {
                        (target_id.clone(), source_id.clone())
                    };

                    // Sum the weights for bi-directional references
                    edge_map.entry(edge_key)
                        .and_modify(|w| *w += *count as f32)
                        .or_insert(*count as f32);
                }
            }
        }

        // Convert edge map to edges
        graph.edges = edge_map.into_iter()
            .map(|((source, target), weight)| {
                Edge::new(source, target, weight)
            })
            .collect();

        // Initialize random positions for all nodes
        Self::initialize_random_positions(&mut graph);

        info!("Built graph with {} nodes and {} edges", graph.nodes.len(), graph.edges.len());
        Ok(graph)
    }

    fn initialize_random_positions(graph: &mut GraphData) {
        let mut rng = rand::thread_rng();
        let node_count = graph.nodes.len() as f32;
        let initial_radius = 0.5; // Half of viewport bounds
        let golden_ratio = (1.0 + 5.0_f32.sqrt()) / 2.0;
        
        // Use Fibonacci sphere distribution for more uniform initial positions
        for (i, node) in graph.nodes.iter_mut().enumerate() {
            let i = i as f32;
            
            // Calculate Fibonacci sphere coordinates
            let theta = 2.0 * std::f32::consts::PI * i / golden_ratio;
            let phi = (1.0 - 2.0 * (i + 0.5) / node_count).acos();
            
            // Add slight randomness to prevent exact overlaps
            let r = initial_radius * (0.9 + rng.gen_range(0.0..0.2));
            
            node.set_x(r * phi.sin() * theta.cos());
            node.set_y(r * phi.sin() * theta.sin());
            node.set_z(r * phi.cos());
            
            // Initialize with zero velocity
            node.set_vx(0.0);
            node.set_vy(0.0);
            node.set_vz(0.0);
        }
    }

    pub async fn calculate_layout(
        gpu_compute: &Arc<RwLock<GPUCompute>>,
        graph: &mut GraphData,
        node_map: &mut HashMap<String, Node>,
        params: &SimulationParams,
    ) -> std::io::Result<()> {
        {
            let mut gpu_compute = gpu_compute.write().await;

            // Update data and parameters
            gpu_compute.update_graph_data(graph)?;
            gpu_compute.update_simulation_params(params)?;
            
            // Perform computation step
            gpu_compute.step()?;
            
            // Get updated positions
            let updated_nodes = gpu_compute.get_node_data()?;
            
            // Update graph with new positions
            for (i, node) in graph.nodes.iter_mut().enumerate() {
                // Update position and velocity from GPU data
                node.data = updated_nodes[i];
                // Update node_map as well
                if let Some(map_node) = node_map.get_mut(&node.id) {
                    map_node.data = updated_nodes[i];
                }
            }
            Ok(())
        }
    }

    pub async fn get_paginated_graph_data(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<PaginatedGraphData, Box<dyn std::error::Error + Send + Sync>> {
        let graph = self.graph_data.read().await;
        
        // Convert page and page_size to usize for vector operations
        let page = page as usize;
        let page_size = page_size as usize;
        let total_nodes = graph.nodes.len();
        
        let start = page * page_size;
        let end = std::cmp::min((page + 1) * page_size, total_nodes);

        let page_nodes: Vec<Node> = graph.nodes
            .iter()
            .skip(start)
            .take(end - start)
            .cloned()
            .collect();

        // Get edges that connect to these nodes
        let node_ids: HashSet<String> = page_nodes.iter()
            .map(|n| n.id.clone())
            .collect();

        let edges: Vec<Edge> = graph.edges
            .iter()
            .filter(|e| node_ids.contains(&e.source) || node_ids.contains(&e.target))
            .cloned()
            .collect();

        Ok(PaginatedGraphData {
            nodes: page_nodes,
            edges,
            metadata: serde_json::to_value(graph.metadata.clone()).unwrap_or_default(),
            total_nodes,
            total_edges: graph.edges.len(),
            total_pages: ((total_nodes as f32 / page_size as f32).ceil()) as u32,
            current_page: page as u32,
        })
    }

    pub async fn get_node_positions(&self) -> Vec<Node> {
        let graph = self.graph_data.read().await;
        if log::log_enabled!(log::Level::Debug) {
            log::debug!("get_node_positions: returning {} nodes", graph.nodes.len());
            for node in &graph.nodes {
                log::debug!("Node {}: pos=[{},{},{}], vel=[{},{},{}]",
                    node.id,
                    node.data.position[0], node.data.position[1], node.data.position[2],
                    node.data.velocity[0], node.data.velocity[1], node.data.velocity[2]
                );
            }
        }
        graph.nodes.clone()
    }

    pub async fn get_graph_data_mut(&self) -> tokio::sync::RwLockWriteGuard<'_, GraphData> {
        self.graph_data.write().await
    }

    pub async fn get_node_map_mut(&self) -> tokio::sync::RwLockWriteGuard<'_, HashMap<String, Node>> {
        self.node_map.write().await
    }

    pub async fn update_node_positions(&self, updates: Vec<(u32, Node)>) -> Result<(), Error> {
        let mut graph = self.graph_data.write().await;
        let mut node_map = self.node_map.write().await;

        for (node_id_u32, node_data) in updates {
            let node_id = node_id_u32.to_string();
            if let Some(node) = node_map.get_mut(&node_id) {
                node.data = node_data.data.clone();
            }
        }

        // Update graph nodes with new positions from the map
        for node in &mut graph.nodes {
            if let Some(updated_node) = node_map.get(&node.id) {
                node.data = updated_node.data.clone();
            }
        }

        Ok(())
    }

    pub fn update_positions(&mut self) -> Pin<Box<dyn Future<Output = Result<(), Error>> + '_>> {
        Box::pin(async move {
            if let Some(gpu) = &self.gpu_compute {
                let mut gpu = gpu.write().await;
                gpu.compute_forces()?;
                Ok(())
            } else {
                // Initialize GPU if not already done
                if self.gpu_compute.is_none() {
                    let settings = Arc::new(RwLock::new(Settings::default()));
                    let graph_data = GraphData::default(); // Or get your actual graph data
                    self.initialize_gpu(settings, &graph_data).await?;
                    return self.update_positions().await;
                }
                Err(Error::new(ErrorKind::Other, "GPU compute not initialized"))
            }
        })
    }

    pub async fn initialize_gpu(&mut self, _settings: Arc<RwLock<Settings>>, graph_data: &GraphData) -> Result<(), Error> {
        info!("Initializing GPU compute system...");

        match GPUCompute::new(graph_data).await {
            Ok(gpu_instance) => {
                // Try a test computation before accepting the GPU
                let mut gpu = gpu_instance.write().await;
                if let Err(e) = gpu.compute_forces() {
                    error!("GPU test computation failed: {}", e);
                    return Err(Error::new(ErrorKind::Other, format!("GPU test computation failed: {}", e)));
                }
                drop(gpu);

                self.gpu_compute = Some(gpu_instance);
                Ok(())
            }
            Err(e) => {
                error!("Failed to initialize GPU compute: {}", e);
                Err(Error::new(ErrorKind::Other, format!("GPU initialization failed: {}", e)))
            }
        }
    }
}
