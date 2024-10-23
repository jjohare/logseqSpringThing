use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::{connect_async, WebSocketStream, MaybeTlsStream};
use tungstenite::protocol::Message;
use tungstenite::http::Request;
use serde_json::json;
use std::sync::Arc;
use tokio::task;
use crate::config::Settings;
use log::{info, error, debug};
use futures::{SinkExt, StreamExt};
use std::error::Error as StdError;
use crate::utils::websocket_manager::WebSocketManager;
use crate::services::piper_service::PiperService;
use tokio::net::TcpStream;
use url::Url;
use base64::{Engine as _, engine::general_purpose};

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
                        // Initialize WebSocket connection to OpenAI if using OpenAI TTS
                        if *use_openai_tts.read().await {
                            ws_stream = Self::initialize_openai_websocket(&settings).await;
                        }
                    },
                    SpeechCommand::SendMessage(msg) => {
                        if *use_openai_tts.read().await {
                            Self::handle_openai_tts(&mut ws_stream, &msg, &websocket_manager).await;
                        } else {
                            Self::handle_local_tts(&piper_service, &msg, &websocket_manager).await;
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
        let url = Url::parse("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01").expect("Failed to parse URL");
        
        let settings_read = settings.read().await;
        let request = Request::builder()
            .uri(url.as_str())
            .header("Authorization", format!("Bearer {}", settings_read.openai.openai_api_key))
            .header("OpenAI-Beta", "realtime=v1")
            .header("User-Agent", "WebXR Graph")
            .header("Origin", "https://api.openai.com")
            .header("Sec-WebSocket-Version", "13")
            .header("Sec-WebSocket-Key", tungstenite::handshake::client::generate_key())
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Host", "api.openai.com")
            .body(())
            .expect("Failed to build request");
        drop(settings_read);

        match connect_async(request).await {
            Ok((stream, _)) => {
                info!("Connected to OpenAI Realtime API");
                Some(stream)
            },
            Err(e) => {
                error!("Failed to connect to OpenAI Realtime API: {}", e);
                None
            },
        }
    }

    async fn handle_openai_tts(
        ws_stream: &mut Option<WebSocketStream<MaybeTlsStream<TcpStream>>>,
        msg: &str,
        websocket_manager: &Arc<WebSocketManager>,
    ) {
        if let Some(stream) = ws_stream {
            let (mut write, mut read) = stream.split();

            // Send message to OpenAI
            let event = json!({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": msg
                        }
                    ]
                }
            });

            if let Err(e) = write.send(Message::Text(event.to_string())).await {
                error!("Failed to send message to OpenAI: {}", e);
                return;
            }

            // Trigger a response
            let response_event = json!({
                "type": "response.create"
            });
            if let Err(e) = write.send(Message::Text(response_event.to_string())).await {
                error!("Failed to trigger response: {}", e);
                return;
            }

            // Handle response from OpenAI
            while let Some(message) = read.next().await {
                match message {
                    Ok(Message::Text(text)) => {
                        if let Ok(json_msg) = serde_json::from_str::<serde_json::Value>(&text) {
                            match json_msg["type"].as_str() {
                                Some("response.text.delta") => {
                                    if let Some(_content) = json_msg["delta"]["text"].as_str() {
                                        // Process text delta and audio
                                        if let Some(audio_data) = json_msg["delta"]["audio"].as_str() {
                                            let audio_bytes = general_purpose::STANDARD.decode(audio_data).unwrap_or_default();
                                            if let Err(e) = websocket_manager.broadcast_audio(audio_bytes).await {
                                                error!("Failed to broadcast audio: {}", e);
                                            }
                                        }
                                    }
                                },
                                Some("response.text.done") => {
                                    debug!("Text response complete");
                                },
                                Some("response.done") => {
                                    debug!("Full response complete");
                                    break;
                                },
                                _ => {}
                            }
                        }
                    },
                    Ok(Message::Close(_)) => {
                        info!("OpenAI WebSocket connection closed by server");
                        break;
                    },
                    Err(e) => {
                        error!("OpenAI WebSocket error: {}", e);
                        break;
                    },
                    _ => {},
                }
            }
        } else {
            error!("WebSocket connection not initialized");
        }
    }

    async fn handle_local_tts(
        piper_service: &Arc<PiperService>,
        msg: &str,
        websocket_manager: &Arc<WebSocketManager>,
    ) {
        if let Ok(audio_samples) = piper_service.generate_speech(msg).await {
            info!("Audio synthesis successful, {} samples generated.", audio_samples.len());
            let audio_bytes: Vec<u8> = audio_samples.iter().flat_map(|&sample| sample.to_le_bytes().to_vec()).collect();
            if let Err(e) = websocket_manager.broadcast_audio(audio_bytes).await {
                error!("Failed to broadcast audio: {}", e);
            }
        } else {
            error!("Failed to synthesize audio");
        }
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn StdError>> {
        let command = SpeechCommand::Initialize;
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn send_message(&self, message: String) -> Result<(), Box<dyn StdError>> {
        let command = SpeechCommand::SendMessage(message);
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn close(&self) -> Result<(), Box<dyn StdError>> {
        let command = SpeechCommand::Close;
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn set_tts_mode(&self, use_openai: bool) -> Result<(), Box<dyn StdError>> {
        let command = SpeechCommand::SetTTSMode(use_openai);
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn synthesize_with_piper(&self, message: &str) -> Result<Vec<f32>, Box<dyn StdError>> {
        self.piper_service.generate_speech(message).await.map_err(|e| Box::new(e) as Box<dyn StdError>)
    }
}
