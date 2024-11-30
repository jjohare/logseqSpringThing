use serde::{Deserialize, Serialize};
use config::{ConfigBuilder, ConfigError, Environment, File};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub debug_mode: bool,
    pub prompt: String,
    pub network: NetworkSettings,
    pub security: SecuritySettings,
    pub github: GitHubSettings,
    pub ragflow: RagFlowSettings,
    pub perplexity: PerplexitySettings,
    pub openai: OpenAISettings,
    pub defaults: DefaultSettings,
    pub visualization: VisualizationSettings,
    pub bloom: BloomSettings,
    pub fisheye: FisheyeSettings,
}

impl Settings {
    pub fn new() -> Result<Self, ConfigError> {
        let builder = ConfigBuilder::<config::builder::DefaultState>::default();
        let config = builder
            // Start with defaults from settings.toml
            .add_source(File::with_name("settings.toml"))
            // Layer on environment variables
            .add_source(Environment::with_prefix("APP"))
            .build()?;

        // Try to convert it into our Settings type
        config.try_deserialize()
    }

    pub fn from_env() -> Result<Self, ConfigError> {
        let builder = ConfigBuilder::<config::builder::DefaultState>::default();
        let config = builder
            .add_source(Environment::with_prefix("APP"))
            .build()?;

        // Try to convert it into our Settings type
        config.try_deserialize()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkSettings {
    pub domain: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecuritySettings {
    pub enable_cors: bool,
    pub allowed_origins: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubSettings {
    pub access_token: String,
    pub repository: String,
    pub branch: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RagFlowSettings {
    pub api_key: String,
    pub endpoint: String,
    pub base_url: String,
    pub timeout: u64,
    pub max_retries: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PerplexitySettings {
    pub api_key: String,
    pub model: String,
    pub api_url: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub top_p: f32,
    pub presence_penalty: f32,
    pub frequency_penalty: f32,
    pub timeout: u64,
    pub rate_limit: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenAISettings {
    pub api_key: String,
    pub model: String,
    pub base_url: String,
    pub timeout: u64,
    pub rate_limit: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DefaultSettings {
    pub max_concurrent_requests: usize,
    pub request_timeout: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VisualizationSettings {
    // Colors
    pub node_color: String,
    pub edge_color: String,
    pub hologram_color: String,

    // Node age-based colors
    pub node_color_new: String,
    pub node_color_recent: String,
    pub node_color_medium: String,
    pub node_color_old: String,
    pub node_age_max_days: u32,

    // Node type colors
    pub node_color_core: String,
    pub node_color_secondary: String,
    pub node_color_default: String,

    // Sizes and scales
    pub min_node_size: f32,
    pub max_node_size: f32,
    pub hologram_scale: f32,

    // Opacity settings
    pub hologram_opacity: f32,
    pub edge_opacity: f32,

    // Environment settings
    pub fog_density: f32,

    // Node material properties
    pub node_material_metalness: f32,
    pub node_material_roughness: f32,
    pub node_material_clearcoat: f32,
    pub node_material_clearcoat_roughness: f32,
    pub node_material_opacity: f32,
    pub node_emissive_min_intensity: f32,
    pub node_emissive_max_intensity: f32,

    // Label properties
    pub label_font_size: u32,
    pub label_font_family: String,
    pub label_padding: u32,
    pub label_vertical_offset: f32,
    pub label_close_offset: f32,
    pub label_background_color: String,
    pub label_text_color: String,
    pub label_info_text_color: String,
    pub label_xr_font_size: u32,

    // Edge properties
    pub edge_weight_normalization: f32,
    pub edge_min_width: f32,
    pub edge_max_width: f32,

    // Geometry properties
    pub geometry_min_segments: u32,
    pub geometry_max_segments: u32,
    pub geometry_segment_per_hyperlink: f32,

    // Interaction properties
    pub click_emissive_boost: f32,
    pub click_feedback_duration: u32,

    // Force-directed layout parameters
    pub force_directed_iterations: u32,
    pub force_directed_spring: f32,
    pub force_directed_repulsion: f32,
    pub force_directed_attraction: f32,
    pub force_directed_damping: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BloomSettings {
    pub node_bloom_strength: f32,
    pub node_bloom_radius: f32,
    pub node_bloom_threshold: f32,
    pub edge_bloom_strength: f32,
    pub edge_bloom_radius: f32,
    pub edge_bloom_threshold: f32,
    pub environment_bloom_strength: f32,
    pub environment_bloom_radius: f32,
    pub environment_bloom_threshold: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FisheyeSettings {
    pub enabled: bool,
    pub strength: f32,
    pub radius: f32,
    pub focus_x: f32,
    pub focus_y: f32,
    pub focus_z: f32,
}
