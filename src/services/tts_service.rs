use std::path::PathBuf;
use uuid::Uuid;
use anyhow::{Result, Context};
use tonic::Request;
use futures::StreamExt;
use tokio::io::AsyncWriteExt;
use hound::{WavWriter, WavSpec};

use crate::sonata_tts_service::sonata_tts::tts_client::TtsClient;
use crate::sonata_tts_service::sonata_tts::{TtsRequest, TtsResponse};

pub struct TtsService {
    client: TtsClient<tonic::transport::Channel>,
    output_dir: PathBuf,
}

impl TtsService {
    pub async fn new(output_dir: PathBuf) -> Result<Self> {
        let client = TtsClient::connect("http://[::1]:50051")
            .await
            .context("Failed to connect to TTS server")?;
        Ok(Self { client, output_dir })
    }

    pub async fn generate_audio(&mut self, text: &str) -> Result<PathBuf> {
        let filename = format!("{}.wav", Uuid::new_v4());
        let output_path = self.output_dir.join(&filename);

        let request = Request::new(TtsRequest {
            text: text.to_string(),
        });

        let response = self.client.synthesize(request)
            .await
            .context("Failed to synthesize audio")?
            .into_inner();

        let spec = WavSpec {
            channels: 1,
            sample_rate: response.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut writer = WavWriter::create(&output_path, spec)
            .context("Failed to create WAV file")?;

        for sample in response.audio_data.chunks_exact(2) {
            let sample = i16::from_le_bytes([sample[0], sample[1]]);
            writer.write_sample(sample)
                .context("Failed to write audio sample")?;
        }

        writer.finalize().context("Failed to finalize WAV file")?;

        Ok(output_path)
    }

    pub async fn generate_audio_stream(&mut self, text: &str) -> Result<PathBuf> {
        let filename = format!("{}.wav", Uuid::new_v4());
        let output_path = self.output_dir.join(&filename);

        let request = Request::new(TtsRequest {
            text: text.to_string(),
        });

        let mut stream = self.client.synthesize_stream(request)
            .await
            .context("Failed to start audio stream")?
            .into_inner();

        let mut writer = None;
        let mut total_samples = 0;

        while let Some(response) = stream.next().await {
            let chunk = response.context("Failed to receive audio chunk")?;
            
            if writer.is_none() {
                let spec = WavSpec {
                    channels: 1,
                    sample_rate: chunk.sample_rate,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                };
                writer = Some(WavWriter::create(&output_path, spec)
                    .context("Failed to create WAV file")?);
            }

            if let Some(ref mut w) = writer {
                for sample in chunk.audio_data.chunks_exact(2) {
                    let sample = i16::from_le_bytes([sample[0], sample[1]]);
                    w.write_sample(sample)
                        .context("Failed to write audio sample")?;
                    total_samples += 1;
                }
            }
        }

        if let Some(mut w) = writer {
            w.finalize().context("Failed to finalize WAV file")?;
        } else {
            anyhow::bail!("No audio data received");
        }

        Ok(output_path)
    }
}