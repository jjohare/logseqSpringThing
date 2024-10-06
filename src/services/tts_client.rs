use std::path::PathBuf;
use std::fs::File;
use std::io::Write;
use uuid::Uuid;
use anyhow::Result;
use tonic::Request;
use crate::sonata_tts_service::sonata_tts::tts_client::TtsClient;
use crate::sonata_tts_service::sonata_tts::TtsRequest;

pub struct TtsService {
    client: TtsClient<tonic::transport::Channel>,
    output_dir: PathBuf,
}

impl TtsService {
    pub async fn new(output_dir: PathBuf) -> Result<Self> {
        let client = TtsClient::connect("http://[::1]:50051").await?;
        Ok(Self { client, output_dir })
    }

    pub async fn generate_audio(&mut self, text: &str) -> Result<PathBuf> {
        let filename = format!("{}.wav", Uuid::new_v4());
        let output_path = self.output_dir.join(&filename);

        let request = Request::new(TtsRequest {
            text: text.to_string(),
        });

        let response = self.client.synthesize(request).await?.into_inner();

        let mut file = File::create(&output_path)?;
        file.write_all(&response.audio_data)?;

        Ok(output_path)
    }
}
