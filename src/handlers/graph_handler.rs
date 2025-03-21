use actix_web::{web, HttpResponse, Responder};
use crate::AppState;
use serde::{Serialize, Deserialize};
use log::{info, debug, error, warn};
use std::collections::HashMap;
use std::sync::Arc;
use crate::models::metadata::Metadata;
use crate::utils::socket_flow_messages::Node;
use crate::services::file_service::FileService;
use crate::services::graph_service::GraphService;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphResponse {
    pub nodes: Vec<Node>,
    pub edges: Vec<crate::models::edge::Edge>,
    pub metadata: HashMap<String, Metadata>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedGraphResponse {
    pub nodes: Vec<Node>,
    pub edges: Vec<crate::models::edge::Edge>,
    pub metadata: HashMap<String, Metadata>,
    pub total_pages: usize,
    pub current_page: usize,
    pub total_items: usize,
    pub page_size: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphQuery {
    pub query: Option<String>,
    pub page: Option<usize>,
    #[serde(rename = "pageSize")]
    pub page_size: Option<usize>,
    pub sort: Option<String>,
    pub filter: Option<String>,
}

pub async fn get_graph_data(state: web::Data<AppState>) -> impl Responder {
    info!("Received request for graph data");
    
    // Check if graph is empty before processing
    {
        let graph = state.graph_service.get_graph_data_mut().await;
        if graph.nodes.is_empty() {
            debug!("Graph is empty, returning empty response");
            return HttpResponse::Ok().json(GraphResponse {
                nodes: vec![],
                edges: vec![],
                metadata: HashMap::new(),
            });
        }
    }
    
    // Make sure the GPU layout is calculated before sending data
    if let Some(gpu_compute) = &state.graph_service.get_gpu_compute().await {
        let mut graph = state.graph_service.get_graph_data_mut().await;
        let mut node_map = state.graph_service.get_node_map_mut().await;
        
        // Get physics settings
        let settings = state.settings.read().await;
        let physics_settings = settings.visualization.physics.clone();
        
        // Create simulation parameters
        let params = crate::models::simulation_params::SimulationParams {
            iterations: physics_settings.iterations,
            spring_strength: physics_settings.spring_strength,
            repulsion: physics_settings.repulsion_strength,
            damping: physics_settings.damping,
            max_repulsion_distance: physics_settings.repulsion_distance,
            viewport_bounds: physics_settings.bounds_size,
            mass_scale: physics_settings.mass_scale,
            boundary_damping: physics_settings.boundary_damping,
            enable_bounds: physics_settings.enable_bounds,
            time_step: 0.016,
            phase: crate::models::simulation_params::SimulationPhase::Dynamic,
            mode: crate::models::simulation_params::SimulationMode::Remote,
        };
        
        // Calculate graph layout using GPU
        info!("Processing graph layout with GPU before sending to client");
        if let Err(e) = crate::services::graph_service::GraphService::calculate_layout(
            gpu_compute, &mut graph, &mut node_map, &params
        ).await {
            warn!("Error calculating graph layout: {}", e);
        }
        
        // Drop locks
        drop(graph);
        drop(node_map);
    } else {
        info!("GPU compute not available, sending graph without GPU processing");
    }
    
    let graph = state.graph_service.get_graph_data_mut().await;
    
    // Ensure all nodes have valid position data
    for node in &graph.nodes {
        if node.data.position.x.is_nan() || node.data.position.y.is_nan() || node.data.position.z.is_nan() {
            warn!("Node {} has invalid position data, returning empty response to prevent client errors", node.id);
            return HttpResponse::Ok().json(GraphResponse {
                nodes: vec![],
                edges: vec![],
                metadata: HashMap::new(),
            });
        }
    }
    
    // Log position data to debug zero positions
    if !graph.nodes.is_empty() {
        // Log a few nodes for debugging
        for (i, node) in graph.nodes.iter().take(5).enumerate() {
            debug!("Node {}: id={}, label={}, pos=[{:.3},{:.3},{:.3}]",
                i, node.id, node.label, node.data.position.x, node.data.position.y, node.data.position.z);
        }
    }
    
    // Log edge data
    if !graph.edges.is_empty() {
        for (i, edge) in graph.edges.iter().take(5).enumerate() {
            debug!("Edge {}: source={}, target={}, weight={:.3}",
                i, edge.source, edge.target, edge.weight);
        }
    }
    
    info!("Preparing graph response with {} nodes and {} edges",
        graph.nodes.len(),
        graph.edges.len()
    );

    let response = GraphResponse {
        nodes: graph.nodes.clone(),
        edges: graph.edges.clone(),
        metadata: graph.metadata.clone(),
    };

    HttpResponse::Ok().json(response)
}

pub async fn get_paginated_graph_data(
    state: web::Data<AppState>,
    query: web::Query<GraphQuery>,
) -> impl Responder {
    info!("Received request for paginated graph data with params: {:?}", query);
    
    // Ensure GPU layout is calculated before sending first page of data
    if query.page.unwrap_or(1) == 1 {
        if let Some(gpu_compute) = &state.graph_service.get_gpu_compute().await {
            let mut graph = state.graph_service.get_graph_data_mut().await;
            let mut node_map = state.graph_service.get_node_map_mut().await;
            
            // Get physics settings
            let settings = state.settings.read().await;
            let physics_settings = settings.visualization.physics.clone();
            
            // Create simulation parameters
            let params = crate::models::simulation_params::SimulationParams {
                iterations: physics_settings.iterations,
                spring_strength: physics_settings.spring_strength,
                repulsion: physics_settings.repulsion_strength,
                damping: physics_settings.damping,
                max_repulsion_distance: physics_settings.repulsion_distance,
                viewport_bounds: physics_settings.bounds_size,
                mass_scale: physics_settings.mass_scale,
                boundary_damping: physics_settings.boundary_damping,
                enable_bounds: physics_settings.enable_bounds,
                time_step: 0.016,
                phase: crate::models::simulation_params::SimulationPhase::Dynamic,
                mode: crate::models::simulation_params::SimulationMode::Remote,
            };
            
            // Calculate graph layout using GPU
            info!("Processing paginated graph layout with GPU before sending to client");
            if let Err(e) = crate::services::graph_service::GraphService::calculate_layout(
                gpu_compute, &mut graph, &mut node_map, &params
            ).await {
                warn!("Error calculating graph layout for paginated data: {}", e);
            }
            
            // Drop locks
            drop(graph);
            drop(node_map);
        } else {
            info!("GPU compute not available, sending paginated graph without GPU processing");
        }
    }

    // Convert to 0-based indexing internally
    let page = query.page.map(|p| p.saturating_sub(1)).unwrap_or(0);
    let page_size = query.page_size.unwrap_or(100);

    if page_size == 0 {
        error!("Invalid page size: {}", page_size);
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Page size must be greater than 0"
        }));
    }

    let graph = state.graph_service.get_graph_data_mut().await;
    let total_items = graph.nodes.len();
    
    if total_items == 0 {
        debug!("Graph is empty");
        return HttpResponse::Ok().json(PaginatedGraphResponse {
            nodes: Vec::new(),
            edges: Vec::new(),
            metadata: HashMap::new(),
            total_pages: 0,
            current_page: 1, // Return 1-based page number
            total_items: 0,
            page_size,
        });
    }

    let total_pages = (total_items + page_size - 1) / page_size;

    if page >= total_pages {
        warn!("Requested page {} exceeds total pages {}", page + 1, total_pages);
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": format!("Page {} exceeds total available pages {}", page + 1, total_pages)
        }));
    }

    let start = page * page_size;
    let end = std::cmp::min(start + page_size, total_items);

    debug!("Calculating slice from {} to {} out of {} total items", start, end, total_items);

    let page_nodes = graph.nodes[start..end].to_vec();

    // Get edges where either source or target is in the current page
    let node_ids: std::collections::HashSet<_> = page_nodes.iter()
        .map(|node| node.id.clone())
        .collect();

    let relevant_edges: Vec<_> = graph.edges.iter()
        .filter(|edge| {
            // Include edges where either the source or target is in our page
            node_ids.contains(&edge.source) || node_ids.contains(&edge.target)
        })
        .cloned()
        .collect();

    debug!("Found {} relevant edges for {} nodes", relevant_edges.len(), page_nodes.len());

    let response = PaginatedGraphResponse {
        nodes: page_nodes,
        edges: relevant_edges,
        metadata: graph.metadata.clone(),
        total_pages,
        current_page: page + 1, // Convert back to 1-based indexing for response
        total_items,
        page_size,
    };

    HttpResponse::Ok().json(response)
}

// Rebuild graph from existing metadata
pub async fn refresh_graph(state: web::Data<AppState>) -> impl Responder {
    info!("Received request to refresh graph");
    
    let metadata = state.metadata.read().await.clone();
    debug!("Building graph from {} metadata entries", metadata.len());
    
    match GraphService::build_graph_from_metadata(&metadata).await {
        Ok(mut new_graph) => {
            let mut graph = state.graph_service.get_graph_data_mut().await;
            let mut node_map = state.graph_service.get_node_map_mut().await;
            
            // Preserve existing node positions
            // Use metadata_id (filename) to match nodes between old and new graphs
            let old_positions: HashMap<String, (f32, f32, f32)> = graph.nodes.iter() 
                .map(|node| (node.metadata_id.clone(), (node.x(), node.y(), node.z())))
                .collect();
            
            debug!("Preserved positions for {} existing nodes by metadata_id", old_positions.len());
            
            // Update positions in new graph
            for node in &mut new_graph.nodes {
                // Look up by metadata_id (filename) instead of numeric ID
                if let Some(&(x, y, z)) = old_positions.get(&node.metadata_id) {
                    node.set_x(x);
                    node.set_y(y);
                    node.set_z(z);
                }
            }
            
            *graph = new_graph;
            
            // Update node_map with new graph nodes
            node_map.clear();
            for node in &graph.nodes {
                node_map.insert(node.id.clone(), node.clone());
            }
            
            info!("Graph refreshed successfully with {} nodes and {} edges", 
                graph.nodes.len(), 
                graph.edges.len()
            );
            
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "Graph refreshed successfully"
            }))
        },
        Err(e) => {
            error!("Failed to refresh graph: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to refresh graph: {}", e)
            }))
        }
    }
}

// Fetch new metadata and rebuild graph
pub async fn update_graph(state: web::Data<AppState>) -> impl Responder {
    info!("Received request to update graph");
    
    // Load current metadata
    let mut metadata = match FileService::load_or_create_metadata() {
        Ok(m) => m,
        Err(e) => {
            error!("Failed to load metadata: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to load metadata: {}", e)
            }));
        }
    };
    
    // Fetch and process new files
    let file_service = FileService::new(Arc::clone(&state.settings));
    match file_service.fetch_and_process_files(&state.content_api, Arc::clone(&state.settings), &mut metadata).await {
        Ok(processed_files) => {
            if processed_files.is_empty() {
                debug!("No new files to process");
                return HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "message": "No updates needed"
                }));
            }
            
            debug!("Processing {} new files", processed_files.len());
            
            // Update metadata in app state
            {
                let mut app_metadata = state.metadata.write().await;
                *app_metadata = metadata.clone();
            }
            
            // Build new graph
            match GraphService::build_graph_from_metadata(&metadata).await {
                Ok(mut new_graph) => {
                    let mut graph = state.graph_service.get_graph_data_mut().await;
                    let mut node_map = state.graph_service.get_node_map_mut().await;
                    
                    // Preserve existing node positions
                    // Use metadata_id (filename) to match nodes between old and new graphs
                    let old_positions: HashMap<String, (f32, f32, f32)> = graph.nodes.iter() 
                        .map(|node| (node.metadata_id.clone(), (node.x(), node.y(), node.z())))
                        .collect();
                    
                    debug!("Preserved positions for {} existing nodes by metadata_id", old_positions.len());
                    
                    // Update positions in new graph
                    for node in &mut new_graph.nodes {
                        // Look up by metadata_id (filename) instead of numeric ID
                        if let Some(&(x, y, z)) = old_positions.get(&node.metadata_id) {
                            node.set_x(x);
                            node.set_y(y);
                            node.set_z(z);
                        }
                    }
                    
                    *graph = new_graph;
                    
                    // Update node_map with new graph nodes
                    node_map.clear();
                    for node in &graph.nodes {
                        node_map.insert(node.id.clone(), node.clone());
                    }
                    
                    debug!("Graph updated successfully");
                    
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": true,
                        "message": format!("Graph updated with {} new files", processed_files.len())
                    }))
                },
                Err(e) => {
                    error!("Failed to build new graph: {}", e);
                    HttpResponse::InternalServerError().json(serde_json::json!({
                        "success": false,
                        "error": format!("Failed to build new graph: {}", e)
                    }))
                }
            }
        },
        Err(e) => {
            error!("Failed to fetch and process files: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to fetch and process files: {}", e)
            }))
        }
    }
}
