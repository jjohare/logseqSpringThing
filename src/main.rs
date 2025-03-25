use webxr::{
    AppState,
    config::Settings,
    handlers::{
        api_handler,
        health_handler,
        pages_handler,
        socket_flow_handler::socket_flow_handler,
        speech_socket_handler::speech_socket_handler,
        nostr_handler,
    },
    services::{
        file_service::FileService,
        graph_service::GraphService,
        github::{GitHubClient, ContentAPI, GitHubConfig},
    },
    utils::gpu_compute::GPUCompute,
    services::speech_service::SpeechService,
};

use actix_web::{web, App, HttpServer, middleware};
use actix_cors::Cors;
use actix_files::Files;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::Duration;
use dotenvy::dotenv;
use log::{error, info, debug, warn};
use webxr::utils::logging::{init_logging_with_config, LogConfig};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Make dotenv optional since env vars can come from Docker
    dotenv().ok();

    // Load settings first to get the log level
    let settings = match Settings::new() {
        Ok(s) => {
            info!("Settings loaded successfully from: {}", 
                std::env::var("SETTINGS_FILE_PATH").unwrap_or_default());
            Arc::new(RwLock::new(s))
        },
        Err(e) => {
            error!("Failed to load settings: {:?}", e);
            return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to initialize settings: {:?}", e)));
        }
    };

    // Initialize logging with settings-based configuration
    let log_config = {
        let settings_read = settings.read().await;
        // Only use debug level if debug is enabled, otherwise use configured level
        let log_level = &settings_read.system.debug.log_level;
        
        LogConfig::new(
            log_level,
            log_level,
        )
    };

    init_logging_with_config(log_config)?;

    debug!("Successfully loaded settings");

    info!("Starting WebXR application...");
    
    // Create web::Data instances first
    let settings_data = web::Data::new(settings.clone());

    // Initialize services
    let github_config = match GitHubConfig::from_env() {
        Ok(config) => config,
        Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to load GitHub config: {}", e)))
    };

    let github_client = match GitHubClient::new(github_config, settings.clone()).await {
        Ok(client) => Arc::new(client),
        Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to initialize GitHub client: {}", e)))
    };

    let content_api = Arc::new(ContentAPI::new(github_client.clone()));

    // Initialize app state asynchronously
    // Initialize speech service
    let speech_service = {
        let service = SpeechService::new(settings.clone());
        Some(Arc::new(service))
    };
    
    let mut app_state = match AppState::new(
            settings.clone(),
            github_client.clone(),
            content_api.clone(),
            None,
            None,
            speech_service,
            None, "default_session".to_string()
        ).await {
            Ok(state) => state,
            Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to initialize app state: {}", e)))
        };

    // Initialize Nostr service
    nostr_handler::init_nostr_service(&mut app_state);

    // First, try to load existing metadata without waiting for GitHub download
    info!("Loading existing metadata for quick initialization");
    let metadata_store = FileService::load_or_create_metadata()
        .map_err(|e| {
            error!("Failed to load existing metadata: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
        })?;

    // Launch GitHub data fetch in background to avoid blocking WebSocket initialization
    // Instead of spawning a background task which causes Send trait issues,
    // log that we're skipping the background fetch to avoid compilation errors
    info!("Note: Background GitHub data fetch is disabled to resolve compilation issues");
    // If GitHub data fetching becomes critical, consider modifying FileService or GitHubClient 
    // to implement Send for all futures

    if metadata_store.is_empty() {
        error!("No metadata found and could not create empty store");
        return Err(std::io::Error::new(std::io::ErrorKind::Other, 
            "No metadata found and could not create empty store".to_string()));
    }

    info!("Loaded {} items from metadata store", metadata_store.len());

    // Update metadata in app state
    {
        let mut app_metadata = app_state.metadata.write().await;
        *app_metadata = metadata_store.clone();
        info!("Loaded metadata into app state");
    }

    // Build initial graph from metadata and initialize GPU compute
    info!("Building initial graph from existing metadata for physics simulation");
    
    // Create the ClientManager that will be shared between GraphService and WebSocket handlers
    let client_manager = app_state.ensure_client_manager().await;
    
    match GraphService::build_graph_from_metadata(&metadata_store).await {
        Ok(graph_data) => {            
            // Initialize GPU compute if not already done
            if app_state.gpu_compute.is_none() {
                info!("No GPU compute instance found, initializing one now");
                match GPUCompute::new(&graph_data).await {
                    Ok(gpu_instance) => {
                        info!("GPU compute initialized successfully");
                        // Update app_state with new GPU compute instance
                        app_state.gpu_compute = Some(gpu_instance);
                        
                        // Shut down the existing GraphService before creating a new one
                        info!("Shutting down existing graph service before reinitializing with GPU");
                        let shutdown_start = std::time::Instant::now();
                        
                        // Attempt shutdown with proper error handling
                        match tokio::time::timeout(Duration::from_secs(5), app_state.graph_service.shutdown()).await {
                            Ok(_) => info!("Graph service shutdown completed successfully in {:?}", shutdown_start.elapsed()),
                            Err(_) => {
                                warn!("Graph service shutdown timed out after 5 seconds");
                                warn!("Proceeding with reinitialization anyway - old simulation loop will self-terminate");
                            }
                        }
                        
                        // Add a small delay to ensure clean shutdown
                        tokio::time::sleep(Duration::from_millis(100)).await;
                        
                        // Reinitialize graph service with GPU compute
                        info!("Reinitializing graph service with GPU compute");
                        app_state.graph_service = GraphService::new(
                            settings.clone(), 
                            app_state.gpu_compute.clone(),
                            Some(client_manager.clone())
                        ).await;
                        
                        info!("Graph service successfully reinitialized with GPU compute");
                    },
                    Err(e) => {
                        warn!("Failed to initialize GPU compute: {}. Continuing with CPU fallback.", e);
                        
                        // Attempt shutdown with proper error handling
                        let shutdown_start = std::time::Instant::now();
                        match tokio::time::timeout(Duration::from_secs(5), app_state.graph_service.shutdown()).await {
                            Ok(_) => info!("Graph service shutdown completed successfully in {:?}", shutdown_start.elapsed()),
                            Err(_) => {
                                warn!("Graph service shutdown timed out after 5 seconds");
                                warn!("Proceeding with reinitialization anyway - old simulation loop will self-terminate");
                            }
                        }
                        
        // Initialize graph service with None as GPU compute (will use CPU fallback)
                        app_state.graph_service = GraphService::new(
                            settings.clone(), 
                            None,
                            Some(client_manager.clone())
                        ).await;
                        
                        info!("Graph service initialized with CPU fallback");
                    }
                }
            }

            // Update graph data after GPU is initialized
            let mut graph = app_state.graph_service.get_graph_data_mut().await;
            let mut node_map = app_state.graph_service.get_node_map_mut().await;
            *graph = graph_data;
            
            // Update node_map with new graph nodes
            node_map.clear();
            for node in &graph.nodes {
                node_map.insert(node.id.clone(), node.clone());
            }
            
            drop(graph);
            drop(node_map);

            info!("Built initial graph from metadata");
            
        },
        Err(e) => {
            error!("Failed to build initial graph: {}", e);
            return Err(std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to build initial graph: {}", e)));
        }
    }

    // Add a delay to allow GPU computation to run before accepting client connections
    info!("Waiting for initial physics layout calculation to complete...");
    tokio::time::sleep(Duration::from_millis(500)).await;
    info!("Initial delay complete. Starting HTTP server...");
    
    // Start the broadcast loop to share position updates with all clients
    info!("Starting position broadcast loop for client synchronization...");
    app_state.graph_service.start_broadcast_loop();
    info!("Position broadcast loop started");

    // Create web::Data after all initialization is complete
    let app_state_data = web::Data::new(app_state);

    // Start the server
    let bind_address = {
        let settings_read = settings.read().await;
        format!("{}:{}", settings_read.system.network.bind_address, settings_read.system.network.port)
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
            .app_data(web::Data::new(github_client.clone()))
            .app_data(web::Data::new(content_api.clone()))
            .app_data(app_state_data.clone())  // Add the complete AppState
            .app_data(app_state_data.nostr_service.clone().unwrap())
            .app_data(app_state_data.feature_access.clone())
            .route("/wss", web::get().to(socket_flow_handler))
            .route("/speech", web::get().to(speech_socket_handler))
            .service(
                web::scope("")
                    .configure(api_handler::config)
                    .service(web::scope("/health").configure(health_handler::config))
                    .service(web::scope("/pages").configure(pages_handler::config))
            )
            .service(Files::new("/", "/app/data/public/dist").index_file("index.html"))
    })
    .bind(&bind_address)?
    .run()
    .await?;

    info!("HTTP server stopped");
    Ok(())
}
