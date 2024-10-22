use actix_files::Files;
use actix_web::{web, App, HttpServer, middleware, HttpRequest, HttpResponse};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use crate::app_state::AppState;
use crate::config::Settings;
use crate::handlers::{file_handler, graph_handler, ragflow_handler};
use crate::models::graph::GraphData;
use crate::services::file_service::{GitHubServiceImpl, FileService};
use crate::services::perplexity_service::PerplexityServiceImpl;
use crate::services::ragflow_service::RAGFlowService;
use crate::services::speech_service::SpeechService;
use crate::services::sonata_service::SonataService;
use crate::services::graph_service::GraphService;
use crate::utils::websocket_manager::WebSocketManager;
use crate::utils::gpu_compute::GPUCompute;
use serde_json::json;

mod app_state;
mod config;
mod handlers;
mod models;
mod services;
mod utils;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logger
    env_logger::init();

    // Load settings
    let settings = match Settings::new() {
        Ok(s) => Arc::new(RwLock::new(s)),
        Err(e) => {
            log::error!("Failed to load settings: {:?}", e);
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to load settings: {:?}", e),
            ));
        }
    };

    // Initialize services
    let file_service = Arc::new(FileService::new());
    let github_service = Arc::new(GitHubServiceImpl::new(/* required args */));
    let perplexity_service = Arc::new(PerplexityServiceImpl::new(/* required args */));
    let ragflow_service = Arc::new(
        RAGFlowService::new(settings.clone())
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?,
    );
    
    let sonata_service = Arc::new(SonataService::new(settings.clone()).await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?);
    
    let websocket_manager = Arc::new(WebSocketManager::new());
    
    // Initialize GPUCompute
    let gpu_compute = Arc::new(RwLock::new(GPUCompute::new().await?));

    let speech_service = Arc::new(SpeechService::new(
        sonata_service.clone(),
        websocket_manager.clone(),
        settings.clone(),
    ));

    // Initialize SpeechService
    if let Err(e) = speech_service.initialize().await {
        log::error!("Failed to initialize SpeechService: {:?}", e);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to initialize SpeechService: {:?}", e),
        ));
    }

    // Initialize WebSocketManager
    if let Err(e) = websocket_manager.initialize(ragflow_service.as_ref()).await {
        log::error!("Failed to initialize WebSocketManager: {:?}", e);
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to initialize WebSocketManager: {:?}", e),
        ));
    }

    // Initialize AppState
    let app_state = web::Data::new(AppState::new(
        Arc::new(RwLock::new(GraphData::default())),
        Arc::new(RwLock::new(HashMap::new())),
        settings.clone(),
        github_service,
        perplexity_service,
        ragflow_service,
        speech_service,
        websocket_manager.clone(),
        Some(gpu_compute),
        "default_conversation_id".to_string(),
        None, // Initialize graph_service as None
    ));

    // Define bind address
    let bind_address = "127.0.0.1:8080";

    // Start HTTP server
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(middleware::Logger::default())
            // Define your routes here
            .route("/data", web::get().to(graph_handler::get_graph_data))
            .route("/simulate", web::post().to(graph_handler::trigger_remote_simulation))
            .service(
                web::scope("/api")
                    .route("/chat/init", web::post().to(ragflow_handler::init_chat))
                    .route("/chat/message", web::post().to(ragflow_handler::send_message))
                    .route("/chat/history", web::get().to(ragflow_handler::get_chat_history))
                    .route("/openai-key", web::get().to(get_openai_key))
            )
            .route(
                "/ws",
                web::get().to({
                    let manager = websocket_manager.clone();
                    let state = app_state.clone();
                    move |req: HttpRequest, stream: web::Payload| {
                        WebSocketManager::handle_websocket(req, stream, state.clone())
                    }
                }),
            )
            .service(
                Files::new("/", "/app/data/public/dist")
                    .index_file("index.html")
                    .use_last_modified(true),
            )
    })
    .bind(&bind_address)?
    .run()
    .await
}

// Handler to get OpenAI API key
async fn get_openai_key(app_state: web::Data<AppState>) -> HttpResponse {
    let settings = app_state.settings.read().await;
    HttpResponse::Ok().json(json!({
        "openai_api_key": settings.openai.openai_api_key.clone()
    }))
}
