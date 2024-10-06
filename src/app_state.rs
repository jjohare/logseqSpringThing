use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::graph::GraphData;
use crate::config::Settings;
use crate::services::file_service::GitHubService;
use crate::services::perplexity_service::PerplexityServiceImpl;
use crate::services::ragflow_service::RAGFlowService;
use crate::utils::websocket_manager::WebSocketManager;
use crate::utils::gpu_compute::GPUCompute;
use crate::tts_service::TtsService;

/// Holds the shared application state accessible across different parts of the application.
pub struct AppState {
    /// Shared graph data protected by a read-write lock.
    pub graph_data: Arc<RwLock<GraphData>>,
    /// Cache for file contents protected by a read-write lock.
    pub file_cache: Arc<RwLock<HashMap<String, String>>>,
    /// Application settings.
    pub settings: Settings,
    /// GitHub service for interacting with GitHub API.
    pub github_service: Arc<dyn GitHubService + Send + Sync>,
    /// Perplexity service for processing files.
    pub perplexity_service: PerplexityServiceImpl,
    /// RAGFlow service for chat functionality and audio streaming.
    pub ragflow_service: Arc<RAGFlowService>,
    /// WebSocket manager for handling WebSocket connections and audio streaming.
    pub websocket_manager: Arc<WebSocketManager>,
    /// GPU Compute for graph calculations protected by a read-write lock.
    /// This is an Option as GPU might not be available.
    pub gpu_compute: Option<Arc<RwLock<GPUCompute>>>,
    /// TTS service for text-to-speech conversion.
    pub tts_service: Arc<RwLock<TtsService>>,
}

impl AppState {
    /// Creates a new `AppState` instance.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        graph_data: Arc<RwLock<GraphData>>,
        file_cache: Arc<RwLock<HashMap<String, String>>>,
        settings: Settings,
        github_service: Arc<dyn GitHubService + Send + Sync>,
        perplexity_service: PerplexityServiceImpl,
        ragflow_service: Arc<RAGFlowService>,
        websocket_manager: Arc<WebSocketManager>,
        gpu_compute: Option<Arc<RwLock<GPUCompute>>>,
        tts_service: Arc<RwLock<TtsService>>,
    ) -> Self {
        Self {
            graph_data,
            file_cache,
            settings,
            github_service,
            perplexity_service,
            ragflow_service,
            websocket_manager,
            gpu_compute,
            tts_service,
        }
    }
}