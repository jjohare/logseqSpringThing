// src/handlers/graph_handler.rs

use actix_web::{web, HttpResponse, Responder};
use crate::AppState;
use serde::Serialize;
use log::{info, error};

/// Struct to serialize GraphData for HTTP responses.
#[derive(Serialize)]
pub struct GraphResponse {
    /// List of nodes in the graph.
    pub nodes: Vec<crate::models::node::Node>,
    /// List of edges connecting the nodes.
    pub edges: Vec<crate::models::edge::Edge>,
}

/// Handler to retrieve the current graph data.
///
/// This function performs the following steps:
/// 1. Reads the shared graph data from the application state.
/// 2. Serializes the graph data into JSON format.
/// 3. Returns the serialized graph data as an HTTP response.
///
/// # Arguments
///
/// * `state` - Shared application state.
///
/// # Returns
///
/// An HTTP response containing the graph data or an error.
pub async fn get_graph_data(state: web::Data<AppState>) -> impl Responder {
    info!("Received request for graph data");

    // Step 1: Acquire read access to the shared graph data.
    let graph = state.graph_data.read().await;

    // Step 2: Prepare the response struct.
    let response = GraphResponse {
        nodes: graph.nodes.clone(),
        edges: graph.edges.clone(),
    };

    // Step 3: Respond with the serialized graph data.
    HttpResponse::Ok().json(response)
}

/// Handler to trigger the remote simulation.
///
/// This function performs the following steps:
/// 1. Retrieves the GraphService from the application state.
/// 2. Calls the perform_remote_simulation method.
/// 3. Returns an HTTP response indicating success or failure.
///
/// # Arguments
///
/// * `state` - Shared application state.
///
/// # Returns
///
/// An HTTP response indicating the result of the remote simulation.
pub async fn trigger_remote_simulation(state: web::Data<AppState>) -> impl Responder {
    info!("Received request to trigger remote simulation");

    // Step 1: Retrieve the GraphService
    let graph_service = state.graph_service.read().await;

    // Step 2: Call perform_remote_simulation
    match graph_service.as_ref().unwrap().perform_remote_simulation().await {
        Ok(_) => {
            info!("Remote simulation completed successfully");
            HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "message": "Remote simulation completed successfully"
            }))
        },
        Err(e) => {
            error!("Failed to perform remote simulation: {:?}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "status": "error",
                "message": format!("Failed to perform remote simulation: {:?}", e)
            }))
        }
    }
}
