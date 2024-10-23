use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::config::Settings;
use anyhow::Result;
use piper::{PiperConfig, Piper};

pub struct PiperService {
    voice_config_path: String,
    piper: Piper,
}

impl PiperService {
    pub async fn new(settings: Arc<RwLock<Settings>>) -> Result<Self> {
        let settings = settings.read().await;
        let voice_config_path = settings.piper.voice_config_path.clone();
        
        let config = PiperConfig::from_file(Path::new(&voice_config_path))
            .map_err(|e| anyhow::anyhow!("Failed to load Piper config: {}", e))?;
        
        let piper = Piper::new(&config)
            .map_err(|e| anyhow::anyhow!("Failed to create Piper instance: {}", e))?;

        Ok(Self {
            voice_config_path,
            piper,
        })
    }

    pub async fn generate_speech(&self, text: &str) -> Result<Vec<f32>> {
        println!("Generating speech for: {}", text);
        println!("Using voice config: {}", self.voice_config_path);

        let audio = self.piper.synthesize(text, None)
            .map_err(|e| anyhow::anyhow!("Failed to synthesize speech: {}", e))?;

        Ok(audio)
    }
}
