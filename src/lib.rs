pub mod app_state;
pub mod config;
pub mod handlers;
pub mod models;
pub mod services;
pub mod utils;
pub mod tts_service;
pub mod sonata_tts_service;
pub mod diacritizer;

// Re-export commonly used types
pub use app_state::AppState;
pub use models::graph::GraphData;
pub use models::edge::Edge;
pub use models::node::Node;
pub use models::metadata::Metadata;
pub use services::file_service::{FileService, GitHubService, GithubFile, ProcessedFile};
pub use services::perplexity_service::{
    PerplexityRequest,
    PerplexityError,
    call_perplexity_api,
    process_markdown,
    PerplexityService,
    clean_logseq_links,
    process_markdown_block,
    select_context_blocks,
    PerplexityResponse,
    Message as PerplexityMessage,
    Choice,
    Delta,
    Usage,
};

// Re-export config
pub use config::Settings;

// Re-export GPUCompute
pub use utils::gpu_compute::GPUCompute;

// Re-export TtsService
pub use tts_service::TtsService;

// Re-export SonataTtsService
pub use sonata_tts_service::SonataTtsService;

// Re-export Diacritizer
pub use diacritizer::{Diacritizer, DiacritizerError, DiacritizerResult};
