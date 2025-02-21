use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::{HashMap, HashSet};
use actix_web::web;
use rand::Rng;
use std::io::{Error, ErrorKind};
use serde_json;

use crate::models::graph::GraphData;
use crate::utils::socket_flow_messages::Node;
use crate::models::edge::Edge;
use crate::models::metadata::MetadataStore;
use crate::app_state::AppState;
use crate::config::Settings;
use crate::utils::gpu_compute::GPUCompute;
use crate::models::simulation_params::{SimulationParams, SimulationPhase, SimulationMode};
use crate::{info, warn, error, debug};
use crate::models::pagination::PaginatedGraphData;

#[derive(Clone)]
pub struct GraphService {
    pub graph_data: Arc<RwLock<GraphData>>,
    gpu_compute: Option<Arc<RwLock<GPUCompute>>>,
}

impl GraphService {
    pub fn new() -> Self {
        let graph_service = Self {
            graph_data: Arc::new(RwLock::new(GraphData::default())),
            gpu_compute: None,
        };

        // Start simulation loop
        let graph_data = graph_service.graph_data.clone();
        let gpu_compute = graph_service.gpu_compute.clone();
        tokio::spawn(async move {
            let params = SimulationParams {
                iterations: 1,  // One iteration per frame
                spring_strength: 5.0,           // Strong spring force for tight clustering
                repulsion: 0.05,               // Minimal repulsion
                damping: 0.98,                 // Very high damping for stability
                max_repulsion_distance: 0.1,   // Small repulsion range
                viewport_bounds: 1.0,          // Small bounds for tight clustering
                mass_scale: 1.0,              // Default mass scaling
                boundary_damping: 0.95,        // Strong boundary damping
                enable_bounds: true,           // Enable bounds by default
                time_step: 0.01,              // Smaller timestep for stability
                phase: SimulationPhase::Dynamic,
                mode: SimulationMode::Remote,    // Force GPU-accelerated computation
            };

            loop {
                // Update positions
                let mut graph = graph_data.write().await;
                if let Err(e) = Self::calculate_layout(&gpu_compute, &mut graph, &params).await {
                    warn!("[Graph] Error updating positions: {}", e);
                }
                drop(graph); // Release lock

                // Sleep for ~16ms (60fps)
                tokio::time::sleep(tokio::time::Duration::from_millis(16)).await;
            }
        });

        graph_service
    }

    pub async fn build_graph_from_metadata(metadata: &MetadataStore) -> Result<GraphData, Box<dyn std::error::Error + Send + Sync>> {
        let mut graph = GraphData::new();
        let mut edge_map = HashMap::new();

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
                node.size = Some(metadata.node_size as f32);
                node.file_size = metadata.file_size as u64;
                node.label = node_id.clone(); // Set label to node ID (filename without .md)
                
                // Add metadata fields to node's metadata map
                node.metadata.insert("fileSize".to_string(), metadata.file_size.to_string());
                node.metadata.insert("hyperlinkCount".to_string(), metadata.hyperlink_count.to_string());
                node.metadata.insert("lastModified".to_string(), metadata.last_modified.to_string());
            }
            
            graph.nodes.push(node);
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
        let current_graph = state.graph_service.graph_data.read().await;
        let mut graph = GraphData::new();

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
                node.size = Some(metadata.node_size as f32);
                node.file_size = metadata.file_size as u64;
                node.label = node_id.clone(); // Set label to node ID (filename without .md)
                
                // Add metadata fields to node's metadata map
                node.metadata.insert("fileSize".to_string(), metadata.file_size.to_string());
                node.metadata.insert("hyperlinkCount".to_string(), metadata.hyperlink_count.to_string());
                node.metadata.insert("lastModified".to_string(), metadata.last_modified.to_string());
            }
            
            graph.nodes.push(node);
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
        gpu_compute: &Option<Arc<RwLock<GPUCompute>>>,
        graph: &mut GraphData,
        params: &SimulationParams,
    ) -> std::io::Result<()> {
        if let Some(gpu) = gpu_compute {
            let mut gpu_compute = gpu.write().await;

            // Update data and parameters
            gpu_compute.update_graph_data(graph)?;
            gpu_compute.update_simulation_params(params)?;
            
            // Perform computation step
            gpu_compute.step()?;
            
            // Get updated positions
            let updated_nodes = gpu_compute.get_node_data()?;
            
            // Update graph with new positions
            for (node, data) in graph.nodes.iter_mut().zip(updated_nodes.iter()) {
                // Update position and velocity from GPU data
                node.data = data.clone();
            }
            Ok(())
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "GPU computation is required. CPU fallback is disabled."
            ))
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
        graph.nodes.clone()
    }

    /// Initialize GPU compute with optimized settings for NVIDIA GPUs
    pub async fn initialize_gpu(
        &mut self,
        settings: Arc<RwLock<Settings>>,
        graph_data: &GraphData,
    ) -> Result<(), Error> {
        info!("Initializing GPU compute system...");

        if !cfg!(feature = "gpu") {
            info!("GPU feature disabled, using CPU computations");
            return Ok(());
        }

        // Read GPU settings from settings
        let settings = settings.read().await;
        let gpu_enabled = settings.system.debug.enabled;
        if !gpu_enabled {
            info!("GPU disabled in settings, using CPU computations");
            return Ok(());
        }

        // Initialize with optimal parameters for NVIDIA GPUs
        let params = SimulationParams {
            iterations: 1,               // One iteration per frame for real-time updates
            spring_strength: 5.0,        // Strong spring force for tight clustering
            repulsion: 0.05,            // Minimal repulsion to prevent node overlap
            damping: 0.98,              // High damping for stability
            max_repulsion_distance: 0.1, // Small repulsion range for local interactions
            viewport_bounds: 1.0,        // Normalized bounds
            mass_scale: 1.0,            // Default mass scaling
            boundary_damping: 0.95,      // Strong boundary damping
            enable_bounds: true,         // Enable bounds for contained layout
            time_step: 0.01,            // Small timestep for numerical stability
            phase: SimulationPhase::Dynamic,
            mode: SimulationMode::Remote,
        };

        match GPUCompute::new(graph_data).await {
            Ok(gpu) => {
                // Unwrap the GPU compute instance from the Arc<RwLock<>>
                let mut gpu_instance = match Arc::try_unwrap(gpu) {
                    Ok(lock) => lock.into_inner(),
                    Err(_) => return Err(Error::new(ErrorKind::Other, "Failed to get exclusive access to GPU compute")),
                };
                
                // Update simulation parameters
                if let Err(e) = gpu_instance.update_simulation_params(&params) {
                    error!("Failed to set simulation parameters: {}", e);
                    return Err(Error::new(ErrorKind::Other, e.to_string()));
                }

                // Verify GPU memory allocation
                if let Err(e) = gpu_instance.update_graph_data(graph_data) {
                    error!("Failed to update graph data: {}", e);
                    return Err(Error::new(ErrorKind::Other, e.to_string()));
                }

                info!("GPU initialization successful - Ready for computation");
                self.gpu_compute = Some(Arc::new(RwLock::new(gpu_instance)));
                Ok(())
            }
            Err(e) => {
                error!("Failed to initialize GPU: {}. Falling back to CPU computations.", e);
                debug!("GPU initialization error details: {:?}", e);
                Ok(())
            }
        }
    }
}
