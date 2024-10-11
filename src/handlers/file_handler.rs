// src/handlers/file_handler.rs
use actix_web::{web, HttpResponse};
use serde_json::json;
use log::{info, error, debug};
use crate::AppState;
use crate::services::file_service::FileService;
use crate::services::graph_service::GraphService;

/// Fetches and processes files from GitHub, updates the file cache, and broadcasts updates.
pub async fn fetch_and_process_files(state: web::Data<AppState>) -> HttpResponse {
    info!("Initiating file fetch and processing");
    
    // Fetch and process files asynchronously
    match FileService::fetch_and_process_files(&*state.github_service, state.settings.clone()).await {
        Ok(processed_files) => {
            let file_names: Vec<String> = processed_files.iter()
                .map(|pf| pf.file_name.clone())
                .collect();

            info!("Successfully processed {} files", processed_files.len());

            // Update the file cache with the processed content
            {
                let mut file_cache = state.file_cache.write().await;
                for processed_file in &processed_files {
                    file_cache.insert(processed_file.file_name.clone(), processed_file.content.clone());
                    debug!("Updated file cache with: {}", processed_file.file_name);
                }
            }

            // Build or refresh the graph data structure based on the processed files
            match GraphService::build_graph(&state).await {
                Ok(graph_data) => {
                    let mut graph = state.graph_data.write().await;
                    *graph = graph_data.clone();
                    info!("Graph data structure updated successfully");

                    // Broadcast the updated graph to connected WebSocket clients
                    let broadcast_result = state.websocket_manager.broadcast_message(&json!({
                        "type": "graphUpdate",
                        "data": graph_data,
                    }).to_string()).await; // Correctly placed await

                    match broadcast_result {
                        Ok(_) => debug!("Graph update broadcasted successfully"),
                        Err(e) => error!("Failed to broadcast graph update: {}", e),
                    }

                    HttpResponse::Ok().json(json!({
                        "status": "success",
                        "processed_files": file_names
                    }))
                },
                Err(e) => {
                    error!("Failed to build graph data: {}", e);
                    HttpResponse::InternalServerError().json(json!({
                        "status": "error",
                        "message": format!("Failed to build graph data: {}", e)
                    }))
                }
            }
        },
        Err(e) => {
            error!("Error processing files: {:?}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": format!("Error processing files: {:?}", e)
            }))
        }
    }
}

/// Retrieves file content from the cache.
pub async fn get_file_content(state: web::Data<AppState>, file_name: web::Path<String>) -> HttpResponse {
    let file_cache = state.file_cache.read().await;
    
    // Retrieve file content from the cache
    match file_cache.get(file_name.as_str()) {
        Some(content) => HttpResponse::Ok().body(content.clone()),
        None => {
            error!("File not found in cache: {}", file_name);
            HttpResponse::NotFound().json(json!({
                "status": "error",
                "message": format!("File not found: {}", file_name)
            }))
        }
    }
}

/// Manually triggers a refresh of the graph data.
pub async fn refresh_graph(state: web::Data<AppState>) -> HttpResponse {
    info!("Manually triggering graph refresh");

    // Rebuild the graph data structure without fetching new files
    match GraphService::build_graph(&state).await {
        Ok(graph_data) => {
            let mut graph = state.graph_data.write().await;
            *graph = graph_data.clone();
            info!("Graph data structure refreshed successfully");

            // Broadcast the updated graph to connected WebSocket clients
            let broadcast_result = state.websocket_manager.broadcast_message(&json!({
                "type": "graphUpdate",
                "data": graph_data,
            }).to_string()).await; // Correctly placed await

            match broadcast_result {
                Ok(_) => debug!("Graph update broadcasted successfully"),
                Err(e) => error!("Failed to broadcast graph update: {}", e),
            }

            HttpResponse::Ok().json(json!({
                "status": "success",
                "message": "Graph refreshed successfully"
            }))
        },
        Err(e) => {
            error!("Failed to refresh graph data: {}", e);
            HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": format!("Failed to refresh graph data: {}", e)
            }))
        }
    }
}
