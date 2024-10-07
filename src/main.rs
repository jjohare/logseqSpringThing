use actix_files::Files;
use actix_web::{web, App, HttpServer, middleware};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::path::PathBuf;
use anyhow::Context;

use crate::app_state::AppState;
use crate::config::Settings;
use crate::handlers::{file_handler, graph_handler, ragflow_handler};
use crate::models::graph::GraphData;
use crate::services::file_service::{GitHubService, RealGitHubService, FileService};
use crate::services::perplexity_service::PerplexityServiceImpl;
use crate::services::ragflow_service::RAGFlowService;
use crate::services::graph_service::GraphService;
use crate::utils::websocket_manager::WebSocketManager;
use crate::utils::gpu_compute::GPUCompute;
use crate::services::tts_service::TtsService;
use crate::services::sonata_tts_service::{run_tts_server, SonataTtsService};

mod app_state;
mod config;
mod handlers;
mod models;
mod services;
mod utils;

// Initialize graph data
async fn initialize_graph_data(app_state: &web::Data<AppState>) -> anyhow::Result<()> {
    // ... (keep the existing implementation)
    Ok(())
}

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Set RUST_LOG to debug if not set
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "debug");
    }

    // Initialize logger
    env_logger::init();
    log::info!("Starting WebXR Graph Server");

    // Load settings
    let settings = Settings::new().context("Failed to load settings")?;
    log::debug!("Successfully loaded settings: {:?}", settings);

    // Start Sonata TTS server
    let tts_config = settings.tts.clone();
    let tts_server_addr = std::env::var("TTS_SERVER_ADDR").unwrap_or_else(|_| "[::]:50051".to_string());
    tokio::spawn(async move {
        if let Err(e) = run_tts_server(&tts_server_addr, tts_config).await {
            log::error!("Failed to start Sonata TTS server: {:?}", e);
        }
    });

    // Initialize shared application state
    let file_cache = Arc::new(RwLock::new(HashMap::new()));
    let graph_data = Arc::new(RwLock::new(GraphData::default()));
    let github_service: Arc<dyn GitHubService + Send + Sync> = Arc::new(RealGitHubService::new(settings.github.clone()));
    let perplexity_service = PerplexityServiceImpl::new();
    let ragflow_service = RAGFlowService::new(&settings);
    let websocket_manager = Arc::new(WebSocketManager::new());
    
    // Initialize GPUCompute
    let gpu_compute = match GPUCompute::new().await {
        Ok(gpu) => {
            log::info!("GPU initialization successful");
            Some(Arc::new(RwLock::new(gpu)))
        },
        Err(e) => {
            log::warn!("Failed to initialize GPU: {}. Falling back to CPU computations.", e);
            None
        }
    };

    // Create a directory for storing audio files
    let audio_dir = PathBuf::from(std::env::var("AUDIO_DIR").unwrap_or_else(|_| "data/audio".to_string()));
    std::fs::create_dir_all(&audio_dir).context("Failed to create audio directory")?;

    // Initialize TtsService
    let tts_service = TtsService::new(audio_dir.clone()).await.context("Failed to initialize TTS service")?;
    let tts_service = Arc::new(RwLock::new(tts_service));

    let app_state = web::Data::new(AppState::new(
        graph_data,
        file_cache,
        settings.clone(),
        github_service,
        perplexity_service,
        ragflow_service.clone(),
        websocket_manager.clone(),
        gpu_compute,
        tts_service,
    ));

    // Initialize graph data
    initialize_graph_data(&app_state).await?;

    // Initialize RAGflow conversation
    websocket_manager.initialize(&ragflow_service).await
        .context("Failed to initialize RAGflow conversation")?;

    // Start HTTP server
    let server_addr = std::env::var("SERVER_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(middleware::Logger::default())
            // Register API routes
            .service(
                web::scope("/api/files")
                    .route("/fetch", web::get().to(file_handler::fetch_and_process_files))
            )
            .service(
                web::scope("/api/graph")
                    .route("/data", web::get().to(graph_handler::get_graph_data))
            )
            .service(
                web::scope("/api/chat")
                    .route("/init", web::post().to(ragflow_handler::init_chat))
                    .route("/message/{conversation_id}", web::post().to(ragflow_handler::send_message))
                    .route("/history/{conversation_id}", web::get().to(ragflow_handler::get_chat_history))
            )
            // Define the WebSocket route
            .route("/ws", web::get().to(WebSocketManager::handle_websocket))
            // Serve static files
            .service(
                Files::new("/", "/app/data/public/dist").index_file("index.html")
            )
            // Serve audio files
            .service(
                Files::new("/audio", audio_dir.to_str().unwrap()).show_files_listing()
            )
    })
    .bind(&server_addr)?
    .run()
    .await
    .context("Failed to start HTTP server")
}