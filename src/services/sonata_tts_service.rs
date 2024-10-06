use tonic::{transport::Server, Request, Response, Status};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use futures::StreamExt;
use log::{info, error};
use std::sync::Arc;
use anyhow::Result;
use onnxruntime::{environment::Environment, session::Session, tensor::OrtOwnedTensor};
use ndarray::Array2;

pub mod sonata_tts {
    tonic::include_proto!("sonata_tts");
}

use sonata_tts::tts_server::{Tts as TtsServer};
use sonata_tts::{TtsRequest, TtsResponse};

#[derive(Clone)]
pub struct SonataTtsService {
    piper: Arc<Piper>,
}

impl SonataTtsService {
    pub fn new(config: &crate::config::TtsConfig) -> Result<Self> {
        let piper = Arc::new(Piper::new(&config.model_path, &config.setup_path)?);
        Ok(Self { piper })
    }

    async fn stream_speak(
        &self,
        text: &str,
    ) -> Result<impl futures::Stream<Item = Result<TtsResponse, Status>>, Status> {
        let (tx, rx) = mpsc::channel(32);
        let piper = self.piper.clone();

        tokio::spawn(async move {
            let chunks = text.split(|c| c == '.' || c == ',' || c == '!' || c == '?');
            for chunk in chunks {
                if chunk.trim().is_empty() {
                    continue;
                }
                match piper.speak(chunk).await {
                    Ok(audio_data) => {
                        if tx.send(Ok(TtsResponse {
                            audio_data,
                            sample_rate: 22050, // Update if different
                        }))
                        .await
                        .is_err()
                        {
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(Status::internal(format!("Synthesis error: {}", e)))).await;
                        break;
                    }
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
        let result = self.piper.speak(&req.text).await
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
        Ok(Response::new(ReceiverStream::new(Box::pin(stream))))
    }
}

pub struct Piper {
    session: Session,
}

impl Piper {
    pub fn new(model_path: &str, _setup_path: &str) -> Result<Self> {
        let environment = Environment::builder().build()?;
        let session = environment.new_session_builder()?
            .with_model_from_file(model_path)?;
        Ok(Self { session })
    }

    pub async fn speak(&self, text: &str) -> Result<Vec<u8>> {
        // This is a placeholder implementation. You'll need to implement
        // the actual text-to-phoneme and phoneme-to-audio conversion here.
        // For now, we'll just return some dummy audio data.
        let input = Array2::from_shape_vec((1, text.len()), text.bytes().collect())?;
        let outputs: Vec<OrtOwnedTensor<f32, _>> = self.session.run(vec![input.into()])?;
        let audio_data = outputs[0].view().to_owned().as_slice().unwrap().to_vec();
        
        // Convert f32 to i16 PCM
        let pcm_data: Vec<i16> = audio_data.iter()
            .map(|&x| (x * 32767.0) as i16)
            .collect();
        
        // Convert i16 to bytes
        let bytes: Vec<u8> = pcm_data.iter()
            .flat_map(|&x| x.to_le_bytes().to_vec())
            .collect();

        Ok(bytes)
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