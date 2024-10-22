// src/handlers/graph_handler.rs

use actix_web::{web, HttpResponse, Responder};
use crate::AppState;
use serde::Serialize;
use log::info;

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
