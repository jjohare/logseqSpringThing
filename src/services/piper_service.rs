use piper_rs::{from_config_path, synth::SonataSpeechSynthesizer};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::config::Settings;

pub struct PiperService {
    synth: SonataSpeechSynthesizer,
}

impl PiperService {
    pub async fn new(settings: Arc<RwLock<Settings>>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let config_path = &settings.read().await.piper.voice_config_path;
        let voice = from_config_path(Path::new(&config_path))
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let synth = SonataSpeechSynthesizer::new(voice)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(Self { synth })
    }

    pub async fn generate_speech(&self, text: &str) -> Result<Vec<f32>, Box<dyn std::error::Error + Send + Sync>> {
        let audio_stream = self.synth.synthesize_parallel(text.to_string(), None)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        let mut samples: Vec<f32> = Vec::new();
        for result in audio_stream {
            samples.append(&mut result
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?
                .into_vec());
        }
        Ok(samples)
    }
}
