use std::path::PathBuf;
use tts::Tts;
use uuid::Uuid;
use anyhow::Result;

pub struct TtsService {
    tts: Tts,
    output_dir: PathBuf,
}

impl TtsService {
    pub fn new(output_dir: PathBuf) -> Result<Self> {
        let tts = Tts::default()?;
        Ok(Self { tts, output_dir })
    }

    pub fn generate_audio(&self, text: &str) -> Result<PathBuf> {
        let filename = format!("{}.wav", Uuid::new_v4());
        let output_path = self.output_dir.join(filename);

        self.tts.speak_to_file(text, &output_path)?;

        Ok(output_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_generate_audio() {
        let temp_dir = tempdir().unwrap();
        let tts_service = TtsService::new(temp_dir.path().to_path_buf()).unwrap();

        let result = tts_service.generate_audio("Hello, world!");
        assert!(result.is_ok());

        let output_path = result.unwrap();
        assert!(output_path.exists());
        assert!(output_path.extension().unwrap() == "wav");
    }
}