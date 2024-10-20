// file_handler.rs

use actix_web::{web, HttpResponse};
use serde_json::json;
use log::{info, error, debug};
use crate::AppState;
use crate::services::file_service::FileService;

/// Handler to fetch and process files from GitHub.
pub async fn fetch_and_process_files(state: web::Data<AppState>) -> HttpResponse {
    info!("Initiating file fetch and processing");

    // Load existing metadata or create a new metadata map if not present.
    let mut metadata_map = match FileService::load_or_create_metadata().await {
        Ok(map) => map,
        Err(e) => {
            error!("Failed to load or create metadata: {}", e);
            return HttpResponse::InternalServerError().json(json!({
                "status": "error",
                "message": "Failed to load metadata"
            }));
        }
    };
    
    // Fetch and process files using the optimized FileService.
    match FileService::fetch_and_process_files(&*state.github_service, state.settings.clone(), &mut metadata_map).await {
        Ok(processed_files) => {
            let file_names: Vec<String> = processed_files.iter()
                .map(|pf| pf.file_name.clone())
                .collect();

            info!("Successfully processed {} files", processed_files.len());

            // Update the in-memory file cache with processed files.
            {
                let mut file_cache = state.file_cache.write().await;
                for processed_file in &processed_files {
                    if processed_file.is_public {
                        metadata_map.insert(processed_file.file_name.clone(), processed_file.metadata.clone());
                    }
                    
                    file_cache.insert(processed_file.file_name.clone(), processed_file.content.clone());
                    debug!("Updated file cache with: {}", processed_file.file_name);
                }
            }

            // Save the updated metadata to the local store.
            if let Err(e) = FileService::save_metadata(&metadata_map).await {
                error!("Failed to save metadata: {}", e);
            }

            // Rebuild the graph based on the updated files.
            let graph_service = state.graph_service.read().await;
            if let Some(gs) = graph_service.as_ref() {
                match gs.build_graph().await {
                    Ok(graph_data) => {
                        let mut graph = state.graph_data.write().await;
                        *graph = graph_data.clone();
                        info!("Graph data structure updated successfully");

                        // Broadcast the updated graph to connected WebSocket clients.
                        let broadcast_result = state.websocket_manager.broadcast_message_compressed(&json!({
                            "type": "graphUpdate",
                            "data": graph_data,
                        }).to_string()).await;

                        match broadcast_result {
                            Ok(_) => debug!("Graph update broadcasted successfully"),
                            Err(e) => error!("Failed to broadcast graph update: {}", e),
                        }

                        // Respond with a success message and list of processed files.
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
            } else {
                error!("GraphService not initialized");
                HttpResponse::InternalServerError().json(json!({
                    "status": "error",
                    "message": "GraphService not initialized"
                }))
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

/// Handler to retrieve the content of a specific file from the cache.
pub async fn get_file_content(state: web::Data<AppState>, file_name: web::Path<String>) -> HttpResponse {
    let file_cache = state.file_cache.read().await;
    
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

/// Handler to manually trigger a graph refresh.
pub async fn refresh_graph(state: web::Data<AppState>) -> HttpResponse {
    info!("Manually triggering graph refresh");

    let graph_service = state.graph_service.read().await;
    if let Some(gs) = graph_service.as_ref() {
        match gs.build_graph().await {
            Ok(graph_data) => {
                let mut graph = state.graph_data.write().await;
                *graph = graph_data.clone();
                info!("Graph data structure refreshed successfully");

                // Broadcast the updated graph to connected WebSocket clients.
                let broadcast_result = state.websocket_manager.broadcast_message_compressed(&json!({
                    "type": "graphUpdate",
                    "data": graph_data,
                }).to_string()).await;

                match broadcast_result {
                    Ok(_) => debug!("Graph update broadcasted successfully"),
                    Err(e) => error!("Failed to broadcast graph update: {}", e),
                }

                // Respond with a success message.
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
    } else {
        error!("GraphService not initialized");
        HttpResponse::InternalServerError().json(json!({
            "status": "error",
            "message": "GraphService not initialized"
        }))
    }
}
