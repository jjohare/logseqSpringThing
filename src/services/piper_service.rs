use piper_rs::synth::SonataSpeechSynthesizer;
use piper_rs::{from_config_path, SonataResult, Audio};
use std::path::Path;
use std::sync::Arc;

pub struct PiperService {
    synth: SonataSpeechSynthesizer,
}

impl PiperService {
    pub fn new(config_path: &Path) -> SonataResult<Self> {
        // Load the model using the provided configuration path
        let model = from_config_path(config_path)?;
        let synth = SonataSpeechSynthesizer::new(Arc::new(model))?;
        Ok(Self { synth })
    }

    pub fn synthesize(&self, text: &str) -> SonataResult<Audio> {
        let audio_stream = self.synth.synthesize_parallel(text.to_string(), None)?;
        let mut samples: Vec<f32> = Vec::new();
        for result in audio_stream {
            samples.append(&mut result? .into_vec());
        }
        Ok(Audio::new(
            samples.into(),
            22050, // Specify your sample rate
            Some(0.0), // Optional inference time
        ))
    }
}
