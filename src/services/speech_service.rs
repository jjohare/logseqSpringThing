use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::{connect_async, WebSocketStream, MaybeTlsStream};
use tungstenite::protocol::Message;
use tungstenite::http::Request;
use serde_json::json;
use std::sync::Arc;
use tokio::task;
use crate::config::Settings;
use log::{info, error};
use futures::{SinkExt, StreamExt};
use std::error::Error as StdError;
use crate::utils::websocket_manager::WebSocketManager;
use crate::services::piper_service::PiperService;
use tokio::net::TcpStream;
use url::Url;
use base64::engine::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use futures::stream::{SplitSink, SplitStream};

pub struct SpeechService {
    sender: Arc<Mutex<mpsc::Sender<SpeechCommand>>>,
    piper_service: Arc<PiperService>,
    websocket_manager: Arc<WebSocketManager>,
    settings: Arc<RwLock<Settings>>,
    use_openai_tts: Arc<RwLock<bool>>,
}

#[derive(Debug)]
enum SpeechCommand {
    Initialize,
    SendMessage(String),
    Close,
    SetTTSMode(bool),
}

impl SpeechService {
    pub fn new(piper_service: Arc<PiperService>, websocket_manager: Arc<WebSocketManager>, settings: Arc<RwLock<Settings>>) -> Self {
        let (tx, rx) = mpsc::channel(100);
        let sender = Arc::new(Mutex::new(tx));

        let service = SpeechService {
            sender,
            piper_service,
            websocket_manager,
            settings,
            use_openai_tts: Arc::new(RwLock::new(false)), // Default to local TTS
        };

        service.start(rx);

        service
    }

    fn start(&self, mut receiver: mpsc::Receiver<SpeechCommand>) {
        let piper_service = self.piper_service.clone();
        let websocket_manager = self.websocket_manager.clone();
        let settings = self.settings.clone();
        let use_openai_tts = self.use_openai_tts.clone();

        task::spawn(async move {
            let mut ws_stream: Option<WebSocketStream<MaybeTlsStream<TcpStream>>> = None;

            while let Some(command) = receiver.recv().await {
                match command {
                    SpeechCommand::Initialize => {
                        if *use_openai_tts.read().await {
                            ws_stream = Self::initialize_openai_websocket(&settings).await;
                        }
                    },
                    SpeechCommand::SendMessage(msg) => {
                        if *use_openai_tts.read().await {
                            if let Err(e) = Self::process_openai_tts(&mut ws_stream, &msg, &websocket_manager).await {
                                error!("Error processing OpenAI TTS: {}", e);
                            }
                        } else {
                            if let Err(e) = Self::process_local_tts(&piper_service, &msg, &websocket_manager).await {
                                error!("Error processing local TTS: {}", e);
                            }
                        }
                    },
                    SpeechCommand::Close => {
                        if let Some(stream) = &mut ws_stream {
                            if let Err(e) = stream.close(None).await {
                                error!("Failed to close WebSocket connection: {}", e);
                            }
                        }
                        break;
                    },
                    SpeechCommand::SetTTSMode(use_openai) => {
                        *use_openai_tts.write().await = use_openai;
                        if use_openai && ws_stream.is_none() {
                            ws_stream = Self::initialize_openai_websocket(&settings).await;
                        }
                    },
                }
            }
        });
    }

    async fn initialize_openai_websocket(settings: &Arc<RwLock<Settings>>) -> Option<WebSocketStream<MaybeTlsStream<TcpStream>>> {
        let url = Url::parse("wss://api.openai.com/v1/audio/speech").expect("Failed to parse URL");
        
        let settings_read = settings.read().await;
        let request = Request::builder()
            .uri(url.as_str())
            .header("Authorization", format!("Bearer {}", settings_read.openai.openai_api_key))
            .header("Content-Type", "application/json")
            .header("User-Agent", "WebXR Graph")
            .body(())
            .expect("Failed to build request");
        drop(settings_read);

        match connect_async(request).await {
            Ok((stream, _)) => {
                info!("Connected to OpenAI Audio API");
                Some(stream)
            },
            Err(e) => {
                error!("Failed to connect to OpenAI Audio API: {}", e);
                None
            },
        }
    }

    async fn process_openai_tts(
        ws_stream: &mut Option<WebSocketStream<MaybeTlsStream<TcpStream>>>,
        msg: &str,
        websocket_manager: &Arc<WebSocketManager>,
    ) -> Result<(), Box<dyn StdError + Send + Sync>> {
        if let Some(stream) = ws_stream {
            let (mut write, mut read) = stream.split();

            Self::send_openai_message(&mut write, msg).await?;
            Self::process_openai_responses(&mut read, websocket_manager).await?;
        } else {
            error!("WebSocket connection to OpenAI is not initialized.");
        }
        Ok(())
    }

    async fn send_openai_message(
        write: &mut SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>,
        msg: &str,
    ) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let event = json!({
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [
                    { "type": "input_text", "text": msg }
                ]
            }
        });

        write.send(Message::Text(event.to_string())).await.map_err(|e| Box::new(e) as Box<dyn StdError + Send + Sync>)
    }

    async fn process_openai_responses(
        read: &mut SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>,
        websocket_manager: &Arc<WebSocketManager>,
    ) -> Result<(), Box<dyn StdError + Send + Sync>> {
        while let Some(message) = read.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    let json_msg: serde_json::Value = serde_json::from_str(&text)?;

                    match json_msg["type"].as_str() {
                        Some("response.text.delta") => {
                            if let Some(audio_data) = json_msg["delta"]["audio"].as_str() {
                                let audio_bytes = BASE64.decode(audio_data)?;
                                websocket_manager.broadcast_audio(audio_bytes).await?;
                            }
                        },
                        Some("response.text.done") | Some("response.done") => break,
                        _ => {}
                    }
                },
                Ok(Message::Close(_)) => {
                    info!("OpenAI WebSocket connection closed by server");
                    break;
                },
                Err(e) => {
                    error!("OpenAI WebSocket error: {}", e);
                    return Err(Box::new(e) as Box<dyn StdError + Send + Sync>);
                },
                _ => {},
            }
        }
        Ok(())
    }

    async fn process_local_tts(
        piper_service: &Arc<PiperService>,
        msg: &str,
        websocket_manager: &Arc<WebSocketManager>,
    ) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let audio_samples = piper_service.generate_speech(msg).await?;
        info!("Audio synthesis successful: {} samples", audio_samples.len());
        let audio_bytes: Vec<u8> = audio_samples.iter().flat_map(|&sample| sample.to_le_bytes().to_vec()).collect();
        websocket_manager.broadcast_audio(audio_bytes).await?;
        Ok(())
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let command = SpeechCommand::Initialize;
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn send_message(&self, message: String) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let command = SpeechCommand::SendMessage(message);
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn close(&self) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let command = SpeechCommand::Close;
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn set_tts_mode(&self, use_openai: bool) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let command = SpeechCommand::SetTTSMode(use_openai);
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn synthesize_with_piper(&self, message: &str) -> Result<Vec<f32>, Box<dyn StdError + Send + Sync>> {
        self.piper_service.generate_speech(message).await
    }
}
