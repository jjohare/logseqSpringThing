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
use std::error::Error;
use crate::utils::websocket_manager::WebSocketManager;
use crate::services::sonata_service::SonataService;
use tokio::net::TcpStream;
use url::Url;

pub struct SpeechService {
    sender: Arc<Mutex<mpsc::Sender<SpeechCommand>>>,
    sonata_service: Arc<SonataService>,
    websocket_manager: Arc<WebSocketManager>,
    settings: Arc<RwLock<Settings>>,
}

#[derive(Debug)]
enum SpeechCommand {
    Initialize,
    SendMessage(String),
    Close,
}

impl SpeechService {
    pub fn new(sonata_service: Arc<SonataService>, websocket_manager: Arc<WebSocketManager>, settings: Arc<RwLock<Settings>>) -> Self {
        let (tx, rx) = mpsc::channel(100);
        let sender = Arc::new(Mutex::new(tx));

        let service = SpeechService {
            sender,
            sonata_service,
            websocket_manager,
            settings,
        };

        service.start(rx);

        service
    }

    fn start(&self, mut receiver: mpsc::Receiver<SpeechCommand>) {
        let sonata_service = self.sonata_service.clone();
        let websocket_manager = self.websocket_manager.clone();
        let settings = self.settings.clone();

        task::spawn(async move {
            let mut ws_stream: Option<WebSocketStream<MaybeTlsStream<TcpStream>>> = None;

            while let Some(command) = receiver.recv().await {
                match command {
                    SpeechCommand::Initialize => {
                        // Initialize WebSocket connection to OpenAI
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
                            .body(())
                            .expect("Failed to build request");
                        drop(settings_read);

                        match connect_async(request).await {
                            Ok((stream, _)) => {
                                info!("Connected to OpenAI Realtime API");
                                ws_stream = Some(stream);
                                
                                // Send initial configuration
                                if let Some(stream) = &mut ws_stream {
                                    let init_event = json!({
                                        "type": "response.create",
                                        "response": {
                                            "modalities": ["text"],
                                            "instructions": "Please assist the user.",
                                        }
                                    });
                                    if let Err(e) = stream.send(Message::Text(init_event.to_string())).await {
                                        error!("Failed to send initial configuration: {}", e);
                                    }
                                }
                            },
                            Err(e) => error!("Failed to connect to OpenAI Realtime API: {}", e),
                        }
                    },
                    SpeechCommand::SendMessage(msg) => {
                        if let Some(stream) = &mut ws_stream {
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
                            } else {
                                info!("Sent message to OpenAI: {}", msg);
                            }

                            // Trigger a response
                            let response_event = json!({
                                "type": "response.create"
                            });
                            if let Err(e) = write.send(Message::Text(response_event.to_string())).await {
                                error!("Failed to trigger response: {}", e);
                            }

                            // Handle response from OpenAI
                            while let Some(message) = read.next().await {
                                match message {
                                    Ok(Message::Text(text)) => {
                                        debug!("Received message from OpenAI: {}", text);
                                        if let Ok(json_msg) = serde_json::from_str::<serde_json::Value>(&text) {
                                            match json_msg["type"].as_str() {
                                                Some("response.text.delta") => {
                                                    if let Some(content) = json_msg["delta"]["text"].as_str() {
                                                        // Process text delta
                                                        debug!("Received text delta: {}", content);

                                                        // Synthesize audio using SonataService
                                                        if let Ok(audio_bytes) = sonata_service.synthesize(content).await {
                                                            info!("Audio synthesis successful, {} bytes generated.", audio_bytes.len());
                                                            // Broadcast audio to all WebSocket sessions
                                                            if let Err(e) = websocket_manager.broadcast_audio(audio_bytes).await {
                                                                error!("Failed to broadcast audio: {}", e);
                                                            }
                                                        } else {
                                                            error!("Failed to synthesize audio");
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
                                                _ => {
                                                    // Handle other event types as needed
                                                }
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
                    },
                    SpeechCommand::Close => {
                        if let Some(stream) = &mut ws_stream {
                            if let Err(e) = stream.close(None).await {
                                error!("Failed to close WebSocket connection: {}", e);
                            }
                        }
                        break;
                    },
                }
            }
        });
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn Error>> {
        let command = SpeechCommand::Initialize;
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn send_message(&self, message: String) -> Result<(), Box<dyn Error>> {
        let command = SpeechCommand::SendMessage(message);
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn close(&self) -> Result<(), Box<dyn Error>> {
        let command = SpeechCommand::Close;
        self.sender.lock().await.send(command).await?;
        Ok(())
    }

    pub async fn synthesize_with_sonata(&self, message: &str) -> Result<Vec<u8>, Box<dyn Error>> {
        self.sonata_service.synthesize(message).await.map_err(|e| Box::new(e) as Box<dyn Error>)
    }
}
