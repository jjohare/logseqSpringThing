use actix_files::Files;
use actix_web::{web, App, HttpServer, middleware, HttpResponse, Error};
use actix_web::http::header;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::env;
use crate::app_state::AppState;
use crate::config::Settings;
use crate::handlers::{file_handler, graph_handler, ragflow_handler};
use crate::models::graph::GraphData;
use crate::services::file_service::{GitHubService, FileService};
use crate::services::perplexity_service::PerplexityServiceImpl;
use crate::services::ragflow_service::RAGFlowService;
use crate::services::speech_service::SpeechService;
use crate::services::sonata_service::SonataService;
use crate::services::graph_service::GraphService;
use crate::utils::websocket_manager::WebSocketManager;

use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};
use actix_web_openssl::OpensslAcceptorExt; // Add this import

mod app_state;
mod config;
mod handlers;
mod models;
mod services;
mod utils;

/// Initializes graph data by fetching and processing files, then building the graph.
async fn initialize_graph_data(app_state: &web::Data<AppState>) -> std::io::Result<()> {
    log::info!("Initializing graph data...");

    let mut metadata_map = HashMap::new();
    match FileService::fetch_and_process_files(&*app_state.github_service, app_state.settings.clone(), &mut metadata_map).await {
        Ok(processed_files) => {
            log::info!("Successfully processed {} files", processed_files.len());

            let mut file_cache = app_state.file_cache.write().await;
            for processed_file in &processed_files {
                file_cache.insert(processed_file.file_name.clone(), processed_file.content.clone());
            }

            // Use the graph_service from app_state
            let graph_service = app_state.graph_service.read().await;
            if let Some(service) = graph_service.as_ref() {
                match service.build_graph().await {
                    Ok(graph_data) => {
                        let mut graph = app_state.graph_data.write().await;
                        *graph = graph_data;
                        log::info!("Graph data structure initialized successfully");
                        Ok(())
                    },
                    Err(e) => {
                        log::error!("Failed to build graph: {:?}", e);
                        Err(std::io::Error::new(std::io::ErrorKind::Other, "Failed to build graph"))
                    }
                }
            } else {
                log::error!("GraphService is not initialized");
                Err(std::io::Error::new(std::io::ErrorKind::Other, "GraphService is not initialized"))
            }
        },
        Err(e) => {
            log::error!("Failed to fetch and process files: {:?}", e);
            Err(std::io::Error::new(std::io::ErrorKind::Other, "Failed to fetch and process files"))
        }
    }
}

async fn test_speech_service(app_state: web::Data<AppState>) -> HttpResponse {
    match app_state.speech_service.send_message("Hello, OpenAI!".to_string()).await {
        Ok(_) => HttpResponse::Ok().body("Message sent successfully"),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    }
}

async fn handle_websocket(
    req: actix_web::HttpRequest,
    stream: web::Payload,
    app_state: web::Data<AppState>
) -> Result<HttpResponse, Error> {
    app_state.websocket_manager.handle_websocket(req, stream, app_state)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    std::env::set_var("RUST_LOG", "debug");
    env_logger::init();
    log::info!("Starting WebXR Graph Server");

    let settings = match Settings::new() {
        Ok(s) => {
            log::debug!("Successfully loaded settings: {:?}", s);
            Arc::new(RwLock::new(s))
        },
        Err(e) => {
            log::error!("Failed to load settings: {:?}", e);
            return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to load settings: {:?}", e)));
        }
    };

    let file_cache = Arc::new(RwLock::new(HashMap::new()));
    let graph_data = Arc::new(RwLock::new(GraphData::default()));
    
    // Initialize services
    let github_service: Arc<dyn GitHubService + Send + Sync> = Arc::new(FileService);
    let perplexity_service = PerplexityServiceImpl::new();
    
    let ragflow_service = match RAGFlowService::new(settings.clone()).await {
        Ok(service) => Arc::new(service),
        Err(e) => {
            log::error!("Failed to initialize RAGFlowService: {:?}", e);
            return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to initialize RAGFlowService: {:?}", e)));
        }
    };

    let websocket_manager = Arc::new(WebSocketManager::new());
    let sonata_service = match SonataService::new(settings.clone()).await {
        Ok(service) => Arc::new(service),
        Err(e) => {
            log::error!("Failed to initialize SonataService: {:?}", e);
            return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to initialize SonataService: {:?}", e)));
        }
    };
    let speech_service = Arc::new(SpeechService::new(sonata_service.clone(), websocket_manager.clone(), settings.clone()));

    let app_state = AppState::new(
        graph_data,
        file_cache,
        settings.clone(),
        github_service,
        perplexity_service,
        ragflow_service,
        speech_service,
        websocket_manager.clone(),
        None,
        "conversation_id_placeholder".to_string(),
        None,
    );

    let app_state = web::Data::new(app_state);

    // Corrected line with `.into()`
    let graph_service = Arc::new(GraphService::new(app_state.clone().into()));
    app_state.graph_service.write().await.replace(graph_service);

    // Initialize Graph Data
    initialize_graph_data(&app_state).await?;

    // Initialize WebSocket Manager
    if let Err(e) = websocket_manager.initialize(&app_state.ragflow_service).await {
        log::error!("Failed to initialize WebSocket Manager: {:?}", e);
        return Err(std::io::Error::new(std::io::ErrorKind::Other, "Failed to initialize WebSocket Manager"));
    }

    // Define the bind address with port 8443
    let port = env::var("PORT").unwrap_or_else(|_| "8443".to_string());
    let bind_address = format!("0.0.0.0:{}", port);

    log::info!("Starting server on {}", bind_address);

    // Initialize SSL with self-signed certificates
    let mut ssl_builder = SslAcceptor::mozilla_intermediate(SslMethod::tls()).unwrap();
    ssl_builder.set_private_key_file("path/to/privkey.pem", SslFiletype::PEM)
        .expect("Failed to set private key file");
    ssl_builder.set_certificate_chain_file("path/to/fullchain.pem")
        .expect("Failed to set certificate chain file");

    // Start the HTTPS server with SSL using actix-web-openssl
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(middleware::Logger::default())
            .wrap(middleware::DefaultHeaders::new()
                .add((header::X_CONTENT_TYPE_OPTIONS, "nosniff"))
                .add((header::CACHE_CONTROL, "max-age=31536000, immutable"))
            )
            .service(
                web::scope("/api/files")
                    .route("/fetch", web::get().to(file_handler::fetch_and_process_files))
            )
            .service(
                web::scope("/api/graph")
                    .route("/data", web::get().to(graph_handler::get_graph_data))
                    .route("/simulate", web::post().to(graph_handler::trigger_remote_simulation))
            )
            .service(
                web::scope("/api/chat")
                    .route("/init", web::post().to(ragflow_handler::init_chat))
                    .route("/message", web::post().to(ragflow_handler::send_message))
                    .route("/history", web::get().to(ragflow_handler::get_chat_history))
            )
            .route("/ws", web::get().to(handle_websocket))
            .route("/test_speech", web::get().to(test_speech_service))
            .service(
                Files::new("/", "/app/data/public/dist")
                    .index_file("index.html")
                    .use_last_modified(true)
            )
    })
    .bind_openssl(&bind_address, ssl_builder)?
    .run()
    .await
}
