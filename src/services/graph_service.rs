// src/services/graph_service.rs

use crate::AppState;
use crate::models::graph::GraphData;
use crate::models::node::Node;
use crate::models::edge::Edge;
use crate::models::metadata::Metadata;
use crate::models::simulation_params::SimulationParams;
use crate::utils::gpu_compute::GPUCompute;
use log::{info, warn, debug};
use std::collections::{HashMap, BinaryHeap, HashSet};
use std::cmp::Ordering;
use tokio::fs;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde_json;
use actix_web::web;

/// Service responsible for building and managing the graph data structure.
pub struct GraphService {
    app_state: Arc<web::Data<AppState>>,
}

impl GraphService {
    pub fn new(app_state: Arc<web::Data<AppState>>) -> Self {
        GraphService { app_state }
    }

    /// Builds the graph data structure from processed Markdown files.
    pub async fn build_graph(&self) -> Result<GraphData, Box<dyn std::error::Error + Send + Sync>> {
        info!("Building graph data from metadata");
        let metadata_path = "/app/data/markdown/metadata.json";
        let metadata_content = fs::read_to_string(metadata_path).await?;
        let metadata: HashMap<String, Metadata> = serde_json::from_str(&metadata_content)?;
    
        let mut graph = GraphData::default();
        let mut edge_map: HashMap<(String, String), (f32, u32)> = HashMap::new();
    
        // Create nodes
        for (file_name, file_metadata) in &metadata {
            let node_id = file_name.trim_end_matches(".md").to_string();
            let mut node_metadata = HashMap::new();
            node_metadata.insert("file_size".to_string(), file_metadata.file_size.to_string());
            graph.nodes.push(Node {
                id: node_id.clone(),
                label: node_id.clone(),
                metadata: node_metadata,
                x: 0.0, y: 0.0, z: 0.0,
                vx: 0.0, vy: 0.0, vz: 0.0,
            });
            graph.metadata.insert(node_id.clone(), file_metadata.clone());
        }
    
        // Build edges
        for (file_name, file_metadata) in &metadata {
            let node_id = file_name.trim_end_matches(".md").to_string();
            for (other_file, _) in &metadata {
                if file_name != other_file {
                    let other_node_id = other_file.trim_end_matches(".md");
                    let count = file_metadata.topic_counts.get(other_node_id).cloned().unwrap_or(0) as f32;
                    if count > 0.0 {
                        let edge_key = if node_id < other_node_id.to_string() {
                            (node_id.clone(), other_node_id.to_string())
                        } else {
                            (other_node_id.to_string(), node_id.clone())
                        };
                        edge_map.entry(edge_key)
                            .and_modify(|(weight, hyperlinks)| {
                                *weight += count;
                                *hyperlinks += file_metadata.hyperlink_count as u32;
                            })
                            .or_insert((count, file_metadata.hyperlink_count as u32));
                    }
                }
            }
        }
    
        // Convert edge_map to edges
        graph.edges = edge_map.into_iter().map(|((source, target), (weight, hyperlinks))| {
            Edge {
                source,
                target_node: target,
                weight,
                hyperlinks: hyperlinks as f32,
            }
        }).collect();
        
        info!("Graph data built with {} nodes and {} edges", graph.nodes.len(), graph.edges.len());
        debug!("Sample node data: {:?}", graph.nodes.first());
        debug!("Sample edge data: {:?}", graph.edges.first());

        // Calculate layout using GPU if available, otherwise fall back to CPU
        let settings = self.app_state.settings.read().await;
        let simulation_params = SimulationParams::from(&settings.visualization);

        Self::calculate_layout(&self.app_state.gpu_compute, &mut graph, &simulation_params).await?;
        
        debug!("Final sample node data after layout calculation: {:?}", graph.nodes.first());
        
        Ok(graph)
    }

    /// Calculates the force-directed layout using GPUCompute if available, otherwise falls back to CPU.
    async fn calculate_layout(
        gpu_compute: &Option<Arc<RwLock<GPUCompute>>>,
        graph: &mut GraphData,
        simulation_params: &SimulationParams
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match gpu_compute {
            Some(gpu) => {
                info!("Using GPU for layout calculation");
                let mut gpu_compute = gpu.write().await; // Acquire write lock
                gpu_compute.set_graph_data(graph)?;
                gpu_compute.set_force_directed_params(simulation_params)?;
                gpu_compute.compute_forces()?;
                let updated_nodes = gpu_compute.get_updated_positions().await?;

                // Update graph nodes with new positions
                for (i, node) in graph.nodes.iter_mut().enumerate() {
                    node.x = updated_nodes[i].x;
                    node.y = updated_nodes[i].y;
                    node.z = updated_nodes[i].z;
                    node.vx = updated_nodes[i].vx;
                    node.vy = updated_nodes[i].vy;
                    node.vz = updated_nodes[i].vz;
                }
                debug!("GPU layout calculation complete. Sample updated node: {:?}", graph.nodes.first());
            },
            None => {
                warn!("GPU not available. Falling back to CPU-based layout calculation.");
                Self::calculate_layout_cpu(graph, simulation_params);
                debug!("CPU layout calculation complete. Sample updated node: {:?}", graph.nodes.first());
            }
        }
        Ok(())
    }

    /// Calculates the force-directed layout using CPU.
    fn calculate_layout_cpu(graph: &mut GraphData, simulation_params: &SimulationParams) {
        const DAMPING: f32 = 0.9;
        const EPSILON: f32 = 0.01;

        for _ in 0..simulation_params.iterations {
            let mut max_movement = 0.0;

            // Calculate repulsive forces
            for i in 0..graph.nodes.len() {
                let mut force = (0.0, 0.0, 0.0);
                for j in 0..graph.nodes.len() {
                    if i != j {
                        let dx = graph.nodes[j].x - graph.nodes[i].x;
                        let dy = graph.nodes[j].y - graph.nodes[i].y;
                        let dz = graph.nodes[j].z - graph.nodes[i].z;
                        let distance = (dx * dx + dy * dy + dz * dz).sqrt().max(EPSILON);
                        let repulsion = simulation_params.repulsion_strength / (distance * distance);
                        force.0 -= repulsion * dx / distance;
                        force.1 -= repulsion * dy / distance;
                        force.2 -= repulsion * dz / distance;
                    }
                }
                graph.nodes[i].vx = (graph.nodes[i].vx + force.0) * DAMPING;
                graph.nodes[i].vy = (graph.nodes[i].vy + force.1) * DAMPING;
                graph.nodes[i].vz = (graph.nodes[i].vz + force.2) * DAMPING;
            }

            // Calculate attractive forces
            for edge in &graph.edges {
                let source = graph.nodes.iter().position(|n| n.id == edge.source).unwrap();
                let target = graph.nodes.iter().position(|n| n.id == edge.target_node).unwrap();
                let dx = graph.nodes[target].x - graph.nodes[source].x;
                let dy = graph.nodes[target].y - graph.nodes[source].y;
                let dz = graph.nodes[target].z - graph.nodes[source].z;
                let distance = (dx * dx + dy * dy + dz * dz).sqrt().max(EPSILON);
                let attraction = simulation_params.attraction_strength * distance * edge.weight;
                let fx = attraction * dx / distance;
                let fy = attraction * dy / distance;
                let fz = attraction * dz / distance;

                graph.nodes[source].vx += fx;
                graph.nodes[source].vy += fy;
                graph.nodes[source].vz += fz;
                graph.nodes[target].vx -= fx;
                graph.nodes[target].vy -= fy;
                graph.nodes[target].vz -= fz;
            }

            // Update positions
            for node in &mut graph.nodes {
                let movement = (node.vx * node.vx + node.vy * node.vy + node.vz * node.vz).sqrt();
                max_movement = max_movement.max(movement);

                node.x += node.vx;
                node.y += node.vy;
                node.z += node.vz;
            }

            // Check for convergence
            if max_movement < EPSILON {
                break;
            }
        }
    }

    /// Finds the shortest path between two nodes in the graph using A* algorithm.
    pub fn find_shortest_path(graph: &GraphData, start: &str, end: &str) -> Result<Vec<String>, String> {
        #[derive(Clone, Eq, PartialEq)]
        struct State {
            cost: f32,
            node: String,
        }

        impl Ord for State {
            fn cmp(&self, other: &Self) -> Ordering {
                other.cost.partial_cmp(&self.cost).unwrap_or(Ordering::Equal)
            }
        }

        impl PartialOrd for State {
            fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
                Some(self.cmp(other))
            }
        }

        let mut heap = BinaryHeap::new();
        let mut costs = HashMap::new();
        let mut came_from = HashMap::new();
        let mut visited = HashSet::new();

        heap.push(State { cost: 0.0, node: start.to_string() });
        costs.insert(start.to_string(), 0.0);

        while let Some(State { cost, node }) = heap.pop() {
            if node == end {
                let mut path = vec![end.to_string()];
                let mut current = end;
                while let Some(prev) = came_from.get(current) {
                    path.push(prev.to_string());
                    current = prev;
                }
                path.reverse();
                return Ok(path);
            }

            if visited.contains(&node) {
                continue;
            }
            visited.insert(node.clone());

            for edge in &graph.edges {
                let next = if edge.source == node {
                    &edge.target_node
                } else if edge.target_node == node {
                    &edge.source
                } else {
                    continue;
                };

                let new_cost = cost + edge.weight;
                if !costs.contains_key(next) || new_cost < *costs.get(next).unwrap() {
                    costs.insert(next.to_string(), new_cost);
                    let priority = new_cost + 1.0; // Simple heuristic
                    heap.push(State { cost: priority, node: next.to_string() });
                    came_from.insert(next.to_string(), node.clone());
                }
            }
        }

        Err("No path found".to_string())
    }
}
