use tonic::{transport::Server, Request, Response, Status};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use futures::StreamExt;
use log::{info, error};
use std::sync::Arc;
use anyhow::Result;

use sonata::models::piper::PiperModel;
use sonata::tts::tts_server::{Tts as TtsServer};
use sonata::tts::{TtsRequest, TtsResponse};
use sonata::synth::SonataSpeechSynthesizer;

#[derive(Clone)]
pub struct SonataTtsService {
    synthesizer: Arc<SonataSpeechSynthesizer>,
}

impl SonataTtsService {
    pub fn new(config: &crate::config::TtsConfig) -> Result<Self> {
        let piper = Arc::new(PiperModel::new(&config.model_path, &config.setup_path)?);
        let synthesizer = Arc::new(SonataSpeechSynthesizer::new(piper)?);
        Ok(Self { synthesizer })
    }

    async fn stream_speak(
        &self,
        text: &str,
    ) -> Result<impl futures::Stream<Item = Result<TtsResponse, Status>>, Status> {
        let (tx, rx) = mpsc::channel(32);
        let synthesizer = self.synthesizer.clone();

        tokio::spawn(async move {
            match synthesizer.speak(text).await {
                Ok(audio_data) => {
                    if tx.send(Ok(TtsResponse {
                        audio_data,
                        sample_rate: 22050, // Update if different
                    }))
                    .await
                    .is_err()
                    {
                        error!("Failed to send audio data");
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(Status::internal(format!("Synthesis error: {}", e)))).await;
                }
            }
        });

        Ok(ReceiverStream::new(rx))
    }
}

#[tonic::async_trait]
impl TtsServer for SonataTtsService {
    async fn synthesize(
        &self,
        request: Request<TtsRequest>,
    ) -> Result<Response<TtsResponse>, Status> {
        let req = request.into_inner();
        let result = self.synthesizer.speak(&req.text).await
            .map_err(|e| Status::internal(format!("Failed to synthesize speech: {}", e)))?;

        Ok(Response::new(TtsResponse {
            audio_data: result,
            sample_rate: 22050, // Update if different
        }))
    }

    type SynthesizeStreamStream = ReceiverStream<Result<TtsResponse, Status>>;

    async fn synthesize_stream(
        &self,
        request: Request<TtsRequest>,
    ) -> Result<Response<Self::SynthesizeStreamStream>, Status> {
        let req = request.into_inner();
        let stream = self.stream_speak(&req.text).await?;
        Ok(Response::new(stream))
    }
}

pub async fn run_tts_server(addr: &str, config: crate::config::TtsConfig) -> Result<(), Box<dyn std::error::Error>> {
    let addr = addr.parse()?;
    let tts_service = SonataTtsService::new(&config)?;

    Server::builder()
        .add_service(TtsServer::new(tts_service))
        .serve(addr)
        .await?;

    Ok(())
}