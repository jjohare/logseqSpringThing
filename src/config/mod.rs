use config::{ConfigBuilder, ConfigError, Environment};
use log::{debug, info};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_yaml;
use std::path::PathBuf;

pub mod feature_access;

// XR movement axes configuration
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MovementAxes {
    pub horizontal: i32,
    pub vertical: i32,
}

// Core visualization settings
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VisualizationSettings {
    pub nodes: NodeSettings,
    pub edges: EdgeSettings,
    pub physics: PhysicsSettings,
    pub rendering: RenderingSettings,
    pub animations: AnimationSettings,
    pub labels: LabelSettings,
    pub bloom: BloomSettings,
    pub hologram: HologramSettings,
}

// System settings
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemSettings {
    pub network: NetworkSettings,
    pub websocket: WebSocketSettings,
    pub security: SecuritySettings,
    pub debug: DebugSettings,
}

// Main settings struct
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub visualization: VisualizationSettings,
    pub system: SystemSettings,
    pub xr: XRSettings,
    pub ragflow: RagFlowSettings,
    pub perplexity: PerplexitySettings,
    pub openai: OpenAISettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeSettings {
    pub base_color: String,
    pub metalness: f32,
    pub opacity: f32,
    pub roughness: f32,
    pub size_range: Vec<f32>,
    pub quality: String,
    pub enable_instancing: bool,
    pub enable_hologram: bool,
    pub enable_metadata_shape: bool,
    pub enable_metadata_visualization: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeSettings {
    pub arrow_size: f32,
    pub base_width: f32,
    pub color: String,
    pub enable_arrows: bool,
    pub opacity: f32,
    pub width_range: Vec<f32>,
    pub quality: String
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhysicsSettings {
    pub attraction_strength: f32,
    pub bounds_size: f32,
    pub collision_radius: f32,
    pub damping: f32,
    pub enable_bounds: bool,
    pub enabled: bool,
    pub iterations: u32,
    pub max_velocity: f32,
    pub repulsion_strength: f32,
    pub spring_strength: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenderingSettings {
    pub ambient_light_intensity: f32,
    pub background_color: String,
    pub directional_light_intensity: f32,
    pub enable_ambient_occlusion: bool,
    pub enable_antialiasing: bool,
    pub enable_shadows: bool,
    pub environment_intensity: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnimationSettings {
    pub enable_motion_blur: bool,
    pub enable_node_animations: bool,
    pub motion_blur_strength: f32,
    pub selection_wave_enabled: bool,
    pub pulse_enabled: bool,
    pub pulse_speed: f32,
    pub pulse_strength: f32,
    pub wave_speed: f32
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LabelSettings {
    pub desktop_font_size: u32,
    pub enable_labels: bool,
    pub text_color: String,
    pub text_outline_color: String,
    pub text_outline_width: f32,
    pub text_resolution: u32,
    pub text_padding: u32,
    pub billboard_mode: String
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BloomSettings {
    pub edge_bloom_strength: f32,
    pub enabled: bool,
    pub environment_bloom_strength: f32,
    pub node_bloom_strength: f32,
    pub radius: f32,
    pub strength: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HologramSettings {
    pub ring_count: u32,
    pub ring_color: String,
    pub ring_opacity: f32,
    pub sphere_sizes: Vec<f32>,  // Native world units
    pub ring_rotation_speed: f32,
    pub enable_buckminster: bool,
    pub buckminster_size: f32,  // Native world units
    pub buckminster_opacity: f32,
    pub enable_geodesic: bool,
    pub geodesic_size: f32,  // Native world units
    pub geodesic_opacity: f32,
    pub enable_triangle_sphere: bool,
    pub triangle_sphere_size: f32,  // Native world units
    pub triangle_sphere_opacity: f32,
    pub global_rotation_speed: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkSettings {
    pub bind_address: String,
    pub domain: String,
    pub enable_http2: bool,
    pub enable_rate_limiting: bool,
    pub enable_tls: bool,
    pub max_request_size: usize,
    pub min_tls_version: String,
    pub port: u16,
    pub rate_limit_requests: u32,
    pub rate_limit_window: u32,
    pub tunnel_id: String,
    pub api_client_timeout: u64,
    pub enable_metrics: bool,
    pub max_concurrent_requests: u32,
    pub max_retries: u32,
    pub metrics_port: u16,
    pub retry_delay: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebSocketSettings {
    pub binary_chunk_size: usize,
    pub binary_update_rate: u32,
    pub binary_message_version: u32,
    pub compression_enabled: bool,
    pub compression_threshold: usize,
    pub heartbeat_interval: u64,
    pub heartbeat_timeout: u64,
    pub max_connections: usize,
    pub max_message_size: usize,
    pub reconnect_attempts: u32,
    pub reconnect_delay: u64,
    pub update_rate: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecuritySettings {
    pub allowed_origins: Vec<String>,
    pub audit_log_path: String,
    pub cookie_httponly: bool,
    pub cookie_samesite: String,
    pub cookie_secure: bool,
    pub csrf_token_timeout: u32,
    pub enable_audit_logging: bool,
    pub enable_request_validation: bool,
    pub session_timeout: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DebugSettings {
    pub enabled: bool,
    pub enable_data_debug: bool,
    pub enable_websocket_debug: bool,
    pub log_binary_headers: bool,
    pub log_full_json: bool,
    pub log_level: String,
    pub log_format: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XRSettings {
    pub mode: String,
    pub room_scale: f32,
    pub space_type: String,
    pub quality: String,
    pub enable_hand_tracking: bool,
    pub hand_mesh_enabled: bool,
    pub hand_mesh_color: String,
    pub hand_mesh_opacity: f32,
    pub hand_point_size: f32,
    pub hand_ray_enabled: bool,
    pub hand_ray_color: String,
    pub hand_ray_width: f32,
    pub gesture_smoothing: f32,
    pub enable_haptics: bool,
    pub haptic_intensity: f32,
    pub drag_threshold: f32,
    pub pinch_threshold: f32,
    pub rotation_threshold: f32,
    pub interaction_radius: f32,
    pub movement_speed: f32,
    pub dead_zone: f32,
    pub movement_axes: MovementAxes,
    pub enable_light_estimation: bool,
    pub enable_plane_detection: bool,
    pub enable_scene_understanding: bool,
    pub plane_color: String,
    pub plane_opacity: f32,
    pub plane_detection_distance: f32,
    pub show_plane_overlay: bool,
    pub snap_to_floor: bool,
    pub enable_passthrough_portal: bool,
    pub passthrough_opacity: f32,
    pub passthrough_brightness: f32,
    pub passthrough_contrast: f32,
    pub portal_size: f32,
    pub portal_edge_color: String,
    pub portal_edge_width: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RagFlowSettings {
    pub api_key: String,
    pub api_base_url: String,
    pub timeout: u64,
    pub max_retries: u32,
    pub chat_id: String,
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
    pub base_url: String,
    pub timeout: u64,
    pub rate_limit: u32,
}

impl Settings {
    pub fn new() -> Result<Self, ConfigError> {
        debug!("Initializing settings");

        // Load .env file first
        dotenvy::dotenv().ok();

        let settings_path = std::env::var("SETTINGS_FILE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/app/settings.yaml"));

        debug!("Loading settings from: {:?}", settings_path);

        // Read and parse YAML file
        let yaml_content = std::fs::read_to_string(&settings_path)
            .map_err(|e| ConfigError::NotFound(format!("Failed to read settings file: {}", e)))?;

        debug!("Deserializing settings from YAML");
        let mut settings: Settings = serde_yaml::from_str(&yaml_content)
            .map_err(|e| ConfigError::Message(format!("Failed to parse YAML: {}", e)))?;

        // Apply environment variables on top of YAML settings
        if let Ok(env_settings) = Settings::from_env() {
            settings.merge_env(env_settings);
        }

        Ok(settings)
    }

    pub fn merge_env(&mut self, _env_settings: Settings) {
        // Environment-specific settings are now handled by their respective modules
    }

    pub fn merge(&mut self, value: Value) -> Result<(), String> {
        // Convert incoming JSON value to snake_case
        let snake_case_value = self.to_snake_case_value(value);

        // Deserialize the value into a temporary Settings
        let new_settings: Settings = serde_json::from_value(snake_case_value)
            .map_err(|e| format!("Failed to deserialize settings: {}", e))?;

        // Update only the fields that were present in the input
        // This preserves existing values for fields that weren't included in the update
        if let Ok(visualization) = serde_json::to_value(&new_settings.visualization) {
            if !visualization.is_null() {
                self.visualization = new_settings.visualization;
            }
        }
        if let Ok(system) = serde_json::to_value(&new_settings.system) {
            if !system.is_null() {
                self.system = new_settings.system;
            }
        }
        if let Ok(xr) = serde_json::to_value(&new_settings.xr) {
            if !xr.is_null() {
                self.xr = new_settings.xr;
            }
        }

        Ok(())
    }

    pub fn save(&self) -> Result<(), String> {
        let settings_path = std::env::var("SETTINGS_FILE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("/app/settings.yaml"));

        // Convert to YAML
        let yaml = serde_yaml::to_string(&self)
            .map_err(|e| format!("Failed to serialize settings to YAML: {}", e))?;

        // Write to file
        std::fs::write(&settings_path, yaml)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;

        Ok(())
    }

    fn to_snake_case_value(&self, value: Value) -> Value {
        match value {
            Value::Object(map) => {
                let converted: serde_json::Map<String, Value> = map
                    .into_iter()
                    .map(|(k, v)| {
                        let snake_case_key = crate::utils::case_conversion::to_snake_case(&k);
                        (snake_case_key, self.to_snake_case_value(v))
                    })
                    .collect();
                Value::Object(converted)
            }
            Value::Array(arr) => Value::Array(
                arr.into_iter()
                    .map(|v| self.to_snake_case_value(v))
                    .collect(),
            ),
            _ => value,
        }
    }

    pub fn from_env() -> Result<Self, ConfigError> {
        let builder = ConfigBuilder::<config::builder::DefaultState>::default();
        let config = builder
            .add_source(Environment::default().separator("_").try_parsing(true))
            .build()?;

        config.try_deserialize()
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            visualization: VisualizationSettings {
                nodes: NodeSettings {
                    base_color: "#c3ab6f".to_string(),
                    metalness: 0.3,
                    opacity: 0.4,
                    roughness: 0.35,
                    size_range: vec![40.0, 120.0],  // Native world units
                    quality: "medium".to_string(),
                    enable_instancing: false,
                    enable_hologram: false,
                    enable_metadata_shape: false,
                    enable_metadata_visualization: false,
                },
                edges: EdgeSettings {
                    arrow_size: 0.15,
                    base_width: 2.0,
                    color: "#917f18".to_string(),
                    enable_arrows: false,
                    opacity: 0.6,
                    width_range: vec![1.0, 3.0],
                    quality: "medium".to_string()
                },
                physics: PhysicsSettings {
                    attraction_strength: 0.015,
                    bounds_size: 12.0,
                    collision_radius: 0.25,
                    damping: 0.88,
                    enable_bounds: true,
                    enabled: false,
                    iterations: 500,
                    max_velocity: 2.5,
                    repulsion_strength: 1500.0,
                    spring_strength: 0.018,
                },
                rendering: RenderingSettings {
                    ambient_light_intensity: 0.3,
                    background_color: "#000000".to_string(),
                    directional_light_intensity: 1.0,
                    enable_ambient_occlusion: false,
                    enable_antialiasing: false,
                    enable_shadows: false,
                    environment_intensity: 0.6,
                },
                animations: AnimationSettings {
                    enable_motion_blur: false,
                    enable_node_animations: false,
                    motion_blur_strength: 0.4,
                    selection_wave_enabled: false,
                    pulse_enabled: false,
                    pulse_speed: 1.0,
                    pulse_strength: 1.0,
                    wave_speed: 1.0
                },
                labels: LabelSettings {
                    desktop_font_size: 48,
                    enable_labels: true,
                    text_color: "#FFFFFF".to_string(),
                    text_outline_color: "#000000".to_string(),
                    text_outline_width: 0.1,
                    text_resolution: 32,
                    text_padding: 2,
                    billboard_mode: "camera".to_string(),
                },
                bloom: BloomSettings {
                    edge_bloom_strength: 0.3,
                    enabled: false,
                    environment_bloom_strength: 0.5,
                    node_bloom_strength: 0.2,
                    radius: 0.5,
                    strength: 1.8,
                },
                hologram: HologramSettings {
                    ring_count: 3,
                    ring_color: "#00ff00".to_string(),
                    ring_opacity: 0.5,
                    sphere_sizes: vec![40.0, 80.0, 120.0],  // Native world units
                    ring_rotation_speed: 0.001,
                    enable_buckminster: false,
                    buckminster_size: 120.0,  // Native world units
                    buckminster_opacity: 0.3,
                    enable_geodesic: false,
                    geodesic_size: 100.0,  // Native world units
                    geodesic_opacity: 0.3,
                    enable_triangle_sphere: false,
                    triangle_sphere_size: 140.0,  // Native world units
                    triangle_sphere_opacity: 0.3,
                    global_rotation_speed: 0.0005,
                },
            },
            system: SystemSettings {
                network: NetworkSettings {
                    bind_address: "0.0.0.0".to_string(),
                    domain: "localhost".to_string(),
                    enable_http2: false,
                    enable_rate_limiting: true,
                    enable_tls: false,
                    max_request_size: 10485760,
                    min_tls_version: String::new(),
                    port: 3001,
                    rate_limit_requests: 100,
                    rate_limit_window: 60,
                    tunnel_id: "dummy".to_string(),
                    api_client_timeout: 30,
                    enable_metrics: true,
                    max_concurrent_requests: 5,
                    max_retries: 3,
                    metrics_port: 9090,
                    retry_delay: 5,
                },
                websocket: WebSocketSettings {
                    binary_chunk_size: 65536,
                    binary_update_rate: 30,
                    binary_message_version: 1,
                    compression_enabled: true,
                    compression_threshold: 1024,
                    heartbeat_interval: 15000,
                    heartbeat_timeout: 60000,
                    max_connections: 1000,
                    max_message_size: 100485760,
                    reconnect_attempts: 3,
                    reconnect_delay: 5000,
                    update_rate: 90,
                },
                security: SecuritySettings {
                    allowed_origins: Vec::new(),
                    audit_log_path: "/app/logs/audit.log".to_string(),
                    cookie_httponly: true,
                    cookie_samesite: "Strict".to_string(),
                    cookie_secure: true,
                    csrf_token_timeout: 3600,
                    enable_audit_logging: true,
                    enable_request_validation: true,
                    session_timeout: 3600,
                },
                debug: DebugSettings {
                    enabled: false,
                    enable_data_debug: false,
                    enable_websocket_debug: false,
                    log_binary_headers: false,
                    log_full_json: false,
                    log_level: "debug".to_string(),
                    log_format: "json".to_string(),
                },
            },
            xr: XRSettings {
                mode: "immersive-ar".to_string(),
                room_scale: 0.1,
                space_type: "local-floor".to_string(),
                quality: "medium".to_string(),
                enable_hand_tracking: true,
                hand_mesh_enabled: true,
                hand_mesh_color: "#ffffff".to_string(),
                hand_mesh_opacity: 0.5,
                hand_point_size: 5.0,
                hand_ray_enabled: true,
                hand_ray_color: "#00ff00".to_string(),
                hand_ray_width: 2.0,
                gesture_smoothing: 0.5,
                enable_haptics: true,
                haptic_intensity: 0.5,
                drag_threshold: 0.02,
                pinch_threshold: 0.7,
                rotation_threshold: 0.1,
                interaction_radius: 0.5,
                movement_speed: 0.05,
                dead_zone: 0.1,
                movement_axes: MovementAxes {
                    horizontal: 2,
                    vertical: 3,
                },
                enable_light_estimation: true,
                enable_plane_detection: true,
                enable_scene_understanding: true,
                plane_color: "#808080".to_string(),
                plane_opacity: 0.5,
                plane_detection_distance: 3.0,
                show_plane_overlay: true,
                snap_to_floor: true,
                enable_passthrough_portal: false,
                passthrough_opacity: 1.0,
                passthrough_brightness: 1.0,
                passthrough_contrast: 1.0,
                portal_size: 2.0,
                portal_edge_color: "#ffffff".to_string(),
                portal_edge_width: 2.0,
            },
            ragflow: RagFlowSettings {
                api_key: String::new(),
                api_base_url: String::new(),
                timeout: 30,
                max_retries: 3,
                chat_id: String::new(),
            },
            perplexity: PerplexitySettings {
                api_key: String::new(),
                model: String::new(),
                api_url: String::new(),
                max_tokens: 4096,
                temperature: 0.5,
                top_p: 0.9,
                presence_penalty: 0.0,
                frequency_penalty: 0.0,
                timeout: 30,
                rate_limit: 100,
            },
            openai: OpenAISettings {
                api_key: String::new(),
                base_url: String::new(),
                timeout: 30,
                rate_limit: 100,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    mod feature_access_test;
}