use serde::Deserialize;
use config::{Config, ConfigError, File, Environment};
use log::debug;
use std::fmt;
use std::env;

#[derive(Deserialize, Clone)]
pub struct Settings {
    pub perplexity: PerplexitySettings,
    pub github: GithubSettings,
    pub ragflow: RagFlowSettings,
    pub openai: OpenAISettings,
    pub visualization: VisualizationSettings,
    pub default: DefaultSettings,
    pub sonata: SonataSettings,
}

#[derive(Deserialize, Clone)]
pub struct PerplexitySettings {
    pub perplexity_api_key: String,
    pub perplexity_model: String,
    pub perplexity_api_base_url: String,
    pub perplexity_max_tokens: u32,
    pub perplexity_temperature: f32,
    pub perplexity_top_p: f32,
    pub perplexity_presence_penalty: f32,
    pub perplexity_frequency_penalty: f32,
}

#[derive(Deserialize, Clone)]
pub struct GithubSettings {
    pub github_access_token: String,
    pub github_owner: String,
    pub github_repo: String,
    pub github_directory: String,
}

#[derive(Deserialize, Clone)]
pub struct RagFlowSettings {
    pub ragflow_api_key: String,
    pub ragflow_api_base_url: String,
}

#[derive(Deserialize, Clone)]
pub struct OpenAISettings {
    pub openai_api_key: String,
    pub openai_base_url: String,
}

#[derive(Deserialize, Clone, Debug)]
pub struct VisualizationSettings {
    pub node_color: String,
    pub edge_color: String,
    pub hologram_color: String,
    pub node_size_scaling_factor: u32,
    pub hologram_scale: u32,
    pub hologram_opacity: f32,
    pub edge_opacity: f32,
    pub label_font_size: u32,
    pub fog_density: f32,
}

#[derive(Deserialize, Clone, Debug)]
pub struct DefaultSettings {
    pub max_concurrent_requests: usize,
    pub max_retries: u32,
    pub retry_delay: u64,
    pub api_client_timeout: u64,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SonataSettings {
    pub voice_config_path: String,
}

impl Settings {
    pub fn new() -> Result<Self, ConfigError> {
        let mut config = Config::builder()
            .add_source(File::with_name("settings.toml").required(true))
            .add_source(Environment::with_prefix("APP").separator("__"));

        // Explicitly load GitHub settings from environment variables
        if let Ok(token) = env::var("GITHUB_ACCESS_TOKEN") {
            config = config.set_override("github.github_access_token", token)?;
        }
        if let Ok(owner) = env::var("GITHUB_OWNER") {
            config = config.set_override("github.github_owner", owner)?;
        }
        if let Ok(repo) = env::var("GITHUB_REPO") {
            config = config.set_override("github.github_repo", repo)?;
        }
        if let Ok(directory) = env::var("GITHUB_DIRECTORY") {
            config = config.set_override("github.github_directory", directory)?;
        }

        // Explicitly load RAGFlow settings from environment variables
        if let Ok(api_key) = env::var("RAGFLOW_API_KEY") {
            config = config.set_override("ragflow.ragflow_api_key", api_key)?;
        }
        if let Ok(base_url) = env::var("RAGFLOW_BASE_URL") {
            config = config.set_override("ragflow.ragflow_api_base_url", base_url)?;
        }
        let settings: Settings = config.build()?.try_deserialize()?;

        // Debugging: Print loaded settings (exclude sensitive fields)
        debug!("Loaded settings: {:?}", settings);

        // Validate settings
        settings.validate()?;

        Ok(settings)
    }

    fn validate(&self) -> Result<(), ConfigError> {
        // Add any additional validation logic here
        if self.default.api_client_timeout == 0 {
            return Err(ConfigError::Message("api_client_timeout must be greater than 0".to_string()));
        }
        if self.github.github_access_token.is_empty() {
            return Err(ConfigError::Message("GitHub access token is missing".to_string()));
        }
        if self.ragflow.ragflow_api_key.is_empty() {
            return Err(ConfigError::Message("RAGFlow API key is missing".to_string()));
        }
        if self.ragflow.ragflow_api_base_url.is_empty() {
            return Err(ConfigError::Message("RAGFlow base URL is missing".to_string()));
        }
        // Add more validations as needed
        Ok(())
    }
}

impl fmt::Debug for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Settings")
            .field("perplexity", &self.perplexity)
            .field("github", &self.github)
            .field("ragflow", &self.ragflow)
            .field("openai", &self.openai)
            .field("visualization", &self.visualization)
            .field("default", &self.default)
            .field("sonata", &self.sonata)
            .finish()
    }
}

impl fmt::Debug for PerplexitySettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PerplexitySettings")
            .field("perplexity_api_key", &"[REDACTED]")
            .field("perplexity_model", &self.perplexity_model)
            .field("perplexity_api_base_url", &self.perplexity_api_base_url)
            .field("perplexity_max_tokens", &self.perplexity_max_tokens)
            .field("perplexity_temperature", &self.perplexity_temperature)
            .field("perplexity_top_p", &self.perplexity_top_p)
            .field("perplexity_presence_penalty", &self.perplexity_presence_penalty)
            .field("perplexity_frequency_penalty", &self.perplexity_frequency_penalty)
            .finish()
    }
}

impl fmt::Debug for GithubSettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GithubSettings")
            .field("github_access_token", &"[REDACTED]")
            .field("github_owner", &self.github_owner)
            .field("github_repo", &self.github_repo)
            .field("github_directory", &self.github_directory)
            .finish()
    }
}

impl fmt::Debug for RagFlowSettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RagFlowSettings")
            .field("ragflow_api_key", &"[REDACTED]")
            .field("ragflow_api_base_url", &self.ragflow_api_base_url)
            .finish()
    }
}

impl fmt::Debug for OpenAISettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("OpenAISettings")
            .field("openai_api_key", &"[REDACTED]")
            .field("openai_base_url", &self.openai_base_url)
            .finish()
    }
}
