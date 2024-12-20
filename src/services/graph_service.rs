use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use actix_web::web;
use log::{info, warn, debug};
use rand::Rng;
use crate::models::graph::GraphData;
use crate::models::node::Node;
use crate::models::edge::Edge;
use crate::models::metadata::Metadata;
use crate::models::simulation_params::SimulationParams;
use crate::utils::gpu_compute::GPUCompute;
use crate::AppState;

pub struct GraphService {
    pub graph_data: Arc<RwLock<GraphData>>,
}

impl GraphService {
    pub fn new() -> Self {
        GraphService {
            graph_data: Arc::new(RwLock::new(GraphData::new())),
        }
    }

    pub async fn build_graph(state: &web::Data<AppState>) -> Result<GraphData, Box<dyn std::error::Error + Send + Sync>> {
        let current_graph = state.graph_data.read().await;
        let mut graph = GraphData::new();

        // Copy metadata from current graph
        graph.metadata = current_graph.metadata.clone();

        debug!("Building graph from {} metadata entries", graph.metadata.len());

        let mut edge_map = HashMap::new();

        // Create nodes from metadata entries
        let mut valid_nodes = HashSet::new();
        for file_name in graph.metadata.keys() {
            let node_id = file_name.trim_end_matches(".md").to_string();
            valid_nodes.insert(node_id);
        }

        // Create nodes for all valid node IDs
        for node_id in &valid_nodes {
            debug!("Creating node for file: {}", node_id);
            graph.nodes.push(Node::new(node_id.clone()));
        }

        debug!("Created {} nodes", graph.nodes.len());

        // Create edges from metadata topic counts
        for (source_file, metadata) in &graph.metadata {
            let source_id = source_file.trim_end_matches(".md").to_string();
            
            debug!("Processing outbound links for {} with {} topic counts", 
                  source_id, metadata.topic_counts.len());
            
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

                    debug!("Creating edge between {} and {} with weight {}", 
                          edge_key.0, edge_key.1, count);

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
                debug!("Adding edge: {} -> {} (weight: {})", source, target, weight);
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
        let initial_radius = 30.0;
        
        for node in &mut graph.nodes {
            let theta = rng.gen_range(0.0..std::f32::consts::PI * 2.0);
            let phi = rng.gen_range(0.0..std::f32::consts::PI);
            let r = rng.gen_range(0.0..initial_radius);
            
            node.x = r * theta.cos() * phi.sin();
            node.y = r * theta.sin() * phi.sin();
            node.z = r * phi.cos();
            node.vx = 0.0;
            node.vy = 0.0;
            node.vz = 0.0;
        }
    }

    pub async fn calculate_layout(
        gpu_compute: &Option<Arc<RwLock<GPUCompute>>>,
        graph: &mut GraphData,
        params: &SimulationParams,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match gpu_compute {
            Some(gpu) => {
                info!("Using GPU for layout calculation");
                let mut gpu_compute = gpu.write().await;
                
                // Only initialize positions for new graphs
                if graph.nodes.iter().all(|n| n.x == 0.0 && n.y == 0.0 && n.z == 0.0) {
                    Self::initialize_random_positions(graph);
                }
                
                gpu_compute.update_graph_data(graph)?;
                gpu_compute.update_simulation_params(params)?;
                
                // Run iterations with more frequent updates
                for _ in 0..params.iterations {
                    gpu_compute.step()?;
                    
                    // Update positions every iteration for smoother motion
                    let updated_nodes = gpu_compute.get_node_positions().await?;
                    for (i, node) in graph.nodes.iter_mut().enumerate() {
                        node.update_from_gpu_node(&updated_nodes[i]);
                        
                        // Apply bounds
                        let max_coord = 100.0;
                        node.x = node.x.clamp(-max_coord, max_coord);
                        node.y = node.y.clamp(-max_coord, max_coord);
                        node.z = node.z.clamp(-max_coord, max_coord);
                    }
                }
                Ok(())
            },
            None => {
                warn!("GPU not available. Falling back to CPU-based layout calculation.");
                Self::calculate_layout_cpu(graph, params.iterations, params.spring_strength, params.damping);
                Ok(())
            }
        }
    }

    fn calculate_layout_cpu(graph: &mut GraphData, iterations: u32, spring_strength: f32, damping: f32) {
        let repulsion_strength = spring_strength * 10000.0;
        
        for _ in 0..iterations {
            // Calculate forces between nodes
            let mut forces = vec![(0.0, 0.0, 0.0); graph.nodes.len()];
            
            // Calculate repulsion forces
            for i in 0..graph.nodes.len() {
                for j in i+1..graph.nodes.len() {
                    let dx = graph.nodes[j].x - graph.nodes[i].x;
                    let dy = graph.nodes[j].y - graph.nodes[i].y;
                    let dz = graph.nodes[j].z - graph.nodes[i].z;
                    
                    let distance = (dx * dx + dy * dy + dz * dz).sqrt();
                    if distance > 0.0 {
                        let force = repulsion_strength / (distance * distance);
                        
                        let fx = dx * force / distance;
                        let fy = dy * force / distance;
                        let fz = dz * force / distance;
                        
                        forces[i].0 -= fx;
                        forces[i].1 -= fy;
                        forces[i].2 -= fz;
                        
                        forces[j].0 += fx;
                        forces[j].1 += fy;
                        forces[j].2 += fz;
                    }
                }
            }

            // Calculate spring forces along edges
            for edge in &graph.edges {
                // Find indices of source and target nodes
                let source_idx = graph.nodes.iter().position(|n| n.id == edge.source);
                let target_idx = graph.nodes.iter().position(|n| n.id == edge.target);
                
                if let (Some(si), Some(ti)) = (source_idx, target_idx) {
                    let source = &graph.nodes[si];
                    let target = &graph.nodes[ti];
                    
                    let dx = target.x - source.x;
                    let dy = target.y - source.y;
                    let dz = target.z - source.z;
                    
                    let distance = (dx * dx + dy * dy + dz * dz).sqrt();
                    if distance > 0.0 {
                        // Scale force by edge weight
                        let force = spring_strength * (distance - 30.0) * edge.weight;
                        
                        let fx = dx * force / distance;
                        let fy = dy * force / distance;
                        let fz = dz * force / distance;
                        
                        forces[si].0 += fx;
                        forces[si].1 += fy;
                        forces[si].2 += fz;
                        
                        forces[ti].0 -= fx;
                        forces[ti].1 -= fy;
                        forces[ti].2 -= fz;
                    }
                }
            }
            
            // Apply forces and update positions
            for (i, node) in graph.nodes.iter_mut().enumerate() {
                node.vx += forces[i].0;
                node.vy += forces[i].1;
                node.vz += forces[i].2;
                
                node.x += node.vx;
                node.y += node.vy;
                node.z += node.vz;
                
                node.vx *= damping;
                node.vy *= damping;
                node.vz *= damping;
            }
        }
    }

    pub async fn build_graph_from_metadata(
        metadata: &HashMap<String, Metadata>
    ) -> Result<GraphData, Box<dyn std::error::Error + Send + Sync>> {
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
            debug!("Creating node for file: {}", node_id);
            graph.nodes.push(Node::new(node_id.clone()));
        }

        debug!("Created {} nodes", valid_nodes.len());

        // Store metadata in graph
        graph.metadata = metadata.clone();

        // Second pass: Create edges from topic counts
        for (source_file, metadata) in metadata {
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

                    debug!("Creating edge between {} and {} with weight {}", 
                          edge_key.0, edge_key.1, count);

                    edge_map.entry(edge_key)
                        .and_modify(|weight| *weight += *count as f32)
                        .or_insert(*count as f32);
                }
            }
        }

        // Convert edge map to edges
        graph.edges = edge_map.into_iter()
            .map(|((source, target), weight)| {
                debug!("Adding edge: {} -> {} (weight: {})", source, target, weight);
                Edge::new(source, target, weight)
            })
            .collect();

        // Initialize random positions
        Self::initialize_random_positions(&mut graph);

        info!("Built graph with {} nodes and {} edges", graph.nodes.len(), graph.edges.len());
        Ok(graph)
    }
}
