use webxr::{
    AppState, Settings,
    file_handler, graph_handler, visualization_handler,
    settings_handler, pages_handler, health_handler,
    RealGitHubService,
    RealGitHubPRService, GPUCompute, GraphData,
    services::{
        file_service::FileService,
        graph_service::GraphService,
    },
    socket_flow_handler,
};

use actix_web::{web, App, HttpServer, middleware};
use actix_cors::Cors;
use actix_files::Files;
use std::sync::Arc;
use tokio::sync::RwLock;
use dotenvy::dotenv;
use log::{error, warn, info, debug};
use webxr::utils::logging::{init_logging_with_config, LogConfig};

// Handler configuration functions
fn configure_file_handler(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/fetch").to(file_handler::fetch_and_process_files))
       .service(web::resource("/content/{file_name}").to(file_handler::get_file_content))
       .service(web::resource("/refresh").to(file_handler::refresh_graph))
       .service(web::resource("/update").to(file_handler::update_graph));
}

fn configure_graph_handler(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/data").to(graph_handler::get_graph_data))
       .service(web::resource("/data/paginated").to(graph_handler::get_paginated_graph_data))
       .service(web::resource("/update").to(graph_handler::update_graph))
       .service(web::resource("/refresh").to(graph_handler::refresh_graph));
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();

    // Load settings first to get the log level
    let settings = match Settings::new() {
        Ok(s) => {
            Arc::new(RwLock::new(s))
        },
        Err(e) => {
            eprintln!("Failed to load settings: {:?}", e);
            return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to initialize settings: {:?}", e)));
        }
    };

    // Initialize logging with settings-based configuration
    let log_config = {
        let settings_read = settings.read().await;
        let file_level = if settings_read.server_debug.enabled { 
            "debug" 
        } else { 
            &settings_read.default.log_level 
        };
        
        let console_level = if settings_read.server_debug.enable_websocket_debug {
            "debug"
        } else {
            &settings_read.default.log_level
        };
        
        LogConfig::new(
            file_level,
            console_level
        )
    };

    init_logging_with_config(log_config)?;

    debug!("Successfully loaded settings");

    info!("Starting WebXR application...");
    
    // Replace log_data! and log_warn! with standard log macros
    info!("Initializing GPU compute...");
    
    let gpu_compute = match GPUCompute::new(&GraphData::default()).await {
        Ok(gpu) => {
            info!("GPU initialization successful");
            Some(gpu)
        }
        Err(e) => {
            warn!("Failed to initialize GPU: {}. Falling back to CPU computations.", e);
            None
        }
    };

    // Create web::Data instances first
    let settings_data = web::Data::new(settings.clone());

    // Initialize services
    let settings_read = settings.read().await;
    let github_service: Arc<RealGitHubService> = match RealGitHubService::new(
        (*settings_read).github.token.clone(),
        (*settings_read).github.owner.clone(),
        (*settings_read).github.repo.clone(),
        (*settings_read).github.base_path.clone(),
        settings.clone(),
    ) {
        Ok(service) => Arc::new(service),
        Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    };

    let github_pr_service: Arc<RealGitHubPRService> = match RealGitHubPRService::new(
        (*settings_read).github.token.clone(),
        (*settings_read).github.owner.clone(),
        (*settings_read).github.repo.clone(),
        (*settings_read).github.base_path.clone()
    ) {
        Ok(service) => Arc::new(service),
        Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    };
    drop(settings_read);

    // Initialize app state
    let app_state = web::Data::new(AppState::new(
        settings.clone(),
        github_service.clone(),
        None,
        None,
        gpu_compute,
        "default_conversation".to_string(),
        github_pr_service.clone(),
    ));

    // Initialize local storage and fetch initial data
    info!("Initializing local storage and fetching initial data");
    if let Err(e) = FileService::initialize_local_storage(&*github_service, settings.clone()).await {
        error!("Failed to initialize local storage: {}", e);
        return Err(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()));
    }

    // Load metadata and build initial graph
    info!("Building initial graph from metadata");
    let metadata_store = FileService::load_or_create_metadata()
        .map_err(|e| {
            error!("Failed to load metadata: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
        })?;

    // Update metadata in app state
    {
        let mut app_metadata = app_state.metadata.write().await;
        *app_metadata = metadata_store.clone();
        info!("Loaded metadata into app state");
    }

    // Build initial graph from metadata
    match GraphService::build_graph_from_metadata(&metadata_store).await {
        Ok(graph_data) => {
            let mut graph = app_state.graph_service.graph_data.write().await;
            *graph = graph_data;
            info!("Built initial graph from metadata");
        },
        Err(e) => {
            error!("Failed to build initial graph: {}", e);
            return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to build initial graph: {}", e)));
        }
    }

    // Start the server
    let bind_address = {
        let settings_read = settings.read().await;
        format!("{}:{}", (*settings_read).network.bind_address, (*settings_read).network.port)
    };

    info!("Starting HTTP server on {}", bind_address);

    HttpServer::new(move || {
        // Configure CORS
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600)
            .supports_credentials();

        App::new()
            .wrap(middleware::Logger::default())
            .wrap(cors)
            .wrap(middleware::Compress::default())
            .app_data(settings_data.clone())
            .app_data(app_state.clone())
            .app_data(web::Data::new(github_service.clone()))
            .app_data(web::Data::new(github_pr_service.clone()))
            .service(
                web::scope("/api")
                    .service(web::scope("/health").configure(health_handler::config))
                    .service(web::scope("/files").configure(configure_file_handler))
                    .service(web::scope("/graph").configure(configure_graph_handler))
                    .service(web::scope("/pages").configure(pages_handler::config))
                    .service(web::scope("/settings").configure(settings_handler::config))
                    .service(web::scope("/visualization").configure(visualization_handler::config))
            )
            .service(
                web::resource("/wss")
                    .app_data(web::PayloadConfig::new(1 << 25))  // 32MB max payload
                    .route(web::get().to(socket_flow_handler))
                    .app_data(settings_data.clone())
                    .app_data(app_state.clone())
            )
            .service(Files::new("/", "/app/client").index_file("index.html"))
    })
    .bind(&bind_address)?
    .run()
    .await?;

    info!("HTTP server stopped");
    Ok(())
}
