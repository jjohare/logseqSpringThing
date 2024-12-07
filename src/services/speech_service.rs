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
use std::fmt;
use crate::utils::websocket_manager::WebSocketManager;
use crate::utils::websocket_messages::{ServerMessage};
use tokio::net::TcpStream;
use url::Url;
use actix_web::{web, Error as ActixError, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use std::time::{Duration, Instant};
use actix::{StreamHandler, AsyncContext, Actor};
use std::process::{Command, Stdio};
use std::io::Write;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug)]
pub enum SpeechError {
    WebSocketError(tungstenite::Error),
    ConnectionError(String),
    SendError(mpsc::error::SendError<SpeechCommand>),
    SerializationError(serde_json::Error),
    ProcessError(std::io::Error),
    Base64Error(base64::DecodeError),
    BroadcastError(String),
    TTSError(String),
}

impl fmt::Display for SpeechError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SpeechError::WebSocketError(e) => write!(f, "WebSocket error: {}", e),
            SpeechError::ConnectionError(msg) => write!(f, "Connection error: {}", msg),
            SpeechError::SendError(e) => write!(f, "Send error: {}", e),
            SpeechError::SerializationError(e) => write!(f, "Serialization error: {}", e),
            SpeechError::ProcessError(e) => write!(f, "Process error: {}", e),
            SpeechError::Base64Error(e) => write!(f, "Base64 error: {}", e),
            SpeechError::BroadcastError(msg) => write!(f, "Broadcast error: {}", msg),
            SpeechError::TTSError(msg) => write!(f, "TTS error: {}", msg),
        }
    }
}

impl Error for SpeechError {}

impl From<tungstenite::Error> for SpeechError {
    fn from(err: tungstenite::Error) -> Self {
        SpeechError::WebSocketError(err)
    }
}

impl From<mpsc::error::SendError<SpeechCommand>> for SpeechError {
    fn from(err: mpsc::error::SendError<SpeechCommand>) -> Self {
        SpeechError::SendError(err)
    }
}

impl From<serde_json::Error> for SpeechError {
    fn from(err: serde_json::Error) -> Self {
        SpeechError::SerializationError(err)
    }
}

impl From<std::io::Error> for SpeechError {
    fn from(err: std::io::Error) -> Self {
        SpeechError::ProcessError(err)
    }
}

impl From<base64::DecodeError> for SpeechError {
    fn from(err: base64::DecodeError) -> Self {
        SpeechError::Base64Error(err)
    }
}

#[derive(Debug, Clone)]
pub enum TTSProvider {
    OpenAI,
    Sonata,
}

#[derive(Debug)]
enum SpeechCommand {
    Initialize,
    SendMessage(String),
    Close,
    SetTTSProvider(TTSProvider),
}

pub struct SpeechService {
    sender: Arc<Mutex<mpsc::Sender<SpeechCommand>>>,
    websocket_manager: Arc<WebSocketManager>,
    settings: Arc<RwLock<Settings>>,
    tts_provider: Arc<RwLock<TTSProvider>>,
}

impl SpeechService {
    pub fn new(websocket_manager: Arc<WebSocketManager>, settings: Arc<RwLock<Settings>>) -> Self {
        let (tx, rx) = mpsc::channel(100);
        let sender = Arc::new(Mutex::new(tx));

        let service = SpeechService {
            sender,
            websocket_manager,
            settings,
            tts_provider: Arc::new(RwLock::new(TTSProvider::Sonata)),
        };

        service.start(rx);
        service
    }

    fn start(&self, mut receiver: mpsc::Receiver<SpeechCommand>) {
        let websocket_manager = Arc::clone(&self.websocket_manager);
        let settings = Arc::clone(&self.settings);
        let tts_provider = Arc::clone(&self.tts_provider);

        task::spawn(async move {
            let mut ws_stream: Option<WebSocketStream<MaybeTlsStream<TcpStream>>> = None;

            while let Some(command) = receiver.recv().await {
                match command {
                    SpeechCommand::Initialize => {
                        let current_provider = tts_provider.read().await;
                        if let TTSProvider::OpenAI = *current_provider {
                            let settings = settings.read().await;
                            
                            let url = format!(
                                "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"
                            );
                            let url = match Url::parse(&url) {
                                Ok(url) => url,
                                Err(e) => {
                                    error!("Failed to parse OpenAI URL: {}", e);
                                    continue;
                                }
                            };
                            
                            let request = match Request::builder()
                                .uri(url.as_str())
                                .header("Authorization", format!("Bearer {}", settings.openai.api_key))
                                .header("OpenAI-Beta", "realtime=v1")
                                .header("Content-Type", "application/json")
                                .header("User-Agent", "WebXR Graph")
                                .header("Sec-WebSocket-Version", "13")
                                .header("Sec-WebSocket-Key", tungstenite::handshake::client::generate_key())
                                .header("Connection", "Upgrade")
                                .header("Upgrade", "websocket")
                                .body(()) {
                                    Ok(req) => req,
                                    Err(e) => {
                                        error!("Failed to build request: {}", e);
                                        continue;
                                    }
                                };

                            match connect_async(request).await {
                                Ok((mut stream, _)) => {
                                    info!("Connected to OpenAI Realtime API");
                                    
                                    let init_event = json!({
                                        "type": "response.create",
                                        "response": {
                                            "modalities": ["text", "audio"],
                                            "instructions": "You are a helpful AI assistant. Respond naturally and conversationally."
                                        }
                                    });
                                    
                                    if let Err(e) = stream.send(Message::Text(init_event.to_string())).await {
                                        error!("Failed to send initial response.create event: {}", e);
                                        continue;
                                    }
                                    
                                    ws_stream = Some(stream);
                                },
                                Err(e) => error!("Failed to connect to OpenAI Realtime API: {}", e),
                            }
                        }
                    },
                    SpeechCommand::SendMessage(msg) => {
                        let current_provider = tts_provider.read().await;
                        match *current_provider {
                            TTSProvider::OpenAI => {
                                if let Some(stream) = &mut ws_stream {
                                    let msg_event = json!({
                                        "type": "conversation.item.create",
                                        "item": {
                                            "type": "message",
                                            "role": "user",
                                            "content": [{
                                                "type": "input_text",
                                                "text": msg
                                            }]
                                        }
                                    });

                                    if let Err(e) = stream.send(Message::Text(msg_event.to_string())).await {
                                        error!("Failed to send message to OpenAI: {}", e);
                                        continue;
                                    }

                                    let response_event = json!({
                                        "type": "response.create"
                                    });
                                    
                                    if let Err(e) = stream.send(Message::Text(response_event.to_string())).await {
                                        error!("Failed to request response from OpenAI: {}", e);
                                        continue;
                                    }
                                    
                                    while let Some(message) = stream.next().await {
                                        match message {
                                            Ok(Message::Text(text)) => {
                                                let event = match serde_json::from_str::<serde_json::Value>(&text) {
                                                    Ok(event) => event,
                                                    Err(e) => {
                                                        error!("Failed to parse server event: {}", e);
                                                        continue;
                                                    }
                                                };
                                                
                                                match event["type"].as_str() {
                                                    Some("conversation.item.created") => {
                                                        if let Some(content) = event["item"]["content"].as_array() {
                                                            for item in content {
                                                                if item["type"] == "audio" {
                                                                    if let Some(audio_data) = item["audio"].as_str() {
                                                                        match BASE64.decode(audio_data) {
                                                                            Ok(audio_bytes) => {
                                                                                let audio_message = ServerMessage::AudioData {
                                                                                    audio_data: BASE64.encode(&audio_bytes),
                                                                                };
                                                                                
                                                                                if let Ok(msg_str) = serde_json::to_string(&audio_message) {
                                                                                    if let Err(e) = websocket_manager.broadcast_message(msg_str).await {
                                                                                        error!("Failed to broadcast message: {}", e);
                                                                                    }
                                                                                }
                                                                            },
                                                                            Err(e) => error!("Failed to decode audio data: {}", e),
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    },
                                                    Some("error") => {
                                                        error!("OpenAI Realtime API error: {:?}", event);
                                                        break;
                                                    },
                                                    Some("response.completed") => break,
                                                    _ => {}
                                                }
                                            },
                                            Ok(Message::Close(_)) => break,
                                            Err(e) => {
                                                error!("Error receiving from OpenAI: {}", e);
                                                break;
                                            },
                                            _ => {}
                                        }
                                    }
                                } else {
                                    error!("OpenAI WebSocket not initialized");
                                }
                            },
                            TTSProvider::Sonata => {
                                let mut child = match Command::new("python3")
                                    .arg("src/generate_audio.py")
                                    .stdin(Stdio::piped())
                                    .stdout(Stdio::piped())
                                    .spawn() {
                                        Ok(child) => child,
                                        Err(e) => {
                                            error!("Failed to spawn Python process: {}", e);
                                            continue;
                                        }
                                    };

                                if let Some(mut stdin) = child.stdin.take() {
                                    if let Err(e) = stdin.write_all(msg.as_bytes()) {
                                        error!("Failed to write to stdin: {}", e);
                                        continue;
                                    }
                                    drop(stdin);
                                }

                                match child.wait_with_output() {
                                    Ok(output) => {
                                        if output.status.success() {
                                            let audio_message = ServerMessage::AudioData {
                                                audio_data: BASE64.encode(&output.stdout),
                                            };
                                            
                                            if let Ok(msg_str) = serde_json::to_string(&audio_message) {
                                                if let Err(e) = websocket_manager.broadcast_message(msg_str).await {
                                                    error!("Failed to broadcast message: {}", e);
                                                }
                                            }
                                        } else {
                                            error!("Sonata TTS failed: {}", String::from_utf8_lossy(&output.stderr));
                                        }
                                    },
                                    Err(e) => error!("Failed to get child process output: {}", e),
                                }
                            }
                        }
                    },
                    SpeechCommand::Close => {
                        if let Some(mut stream) = ws_stream.take() {
                            if let Err(e) = stream.send(Message::Close(None)).await {
                                error!("Failed to send close frame: {}", e);
                            }
                        }
                        break;
                    },
                    SpeechCommand::SetTTSProvider(new_provider) => {
                        let mut provider = tts_provider.write().await;
                        *provider = new_provider;
                        info!("TTS provider set to: {:?}", *provider);
                    }
                }
            }
        });
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn Error>> {
        let command = SpeechCommand::Initialize;
        self.sender.lock().await.send(command).await.map_err(|e| Box::new(SpeechError::from(e)))?;
        Ok(())
    }

    pub async fn send_message(&self, message: String) -> Result<(), Box<dyn Error>> {
        let command = SpeechCommand::SendMessage(message);
        self.sender.lock().await.send(command).await.map_err(|e| Box::new(SpeechError::from(e)))?;
        Ok(())
    }

    pub async fn close(&self) -> Result<(), Box<dyn Error>> {
        let command = SpeechCommand::Close;
        self.sender.lock().await.send(command).await.map_err(|e| Box::new(SpeechError::from(e)))?;
        Ok(())
    }

    pub async fn set_tts_provider(&self, use_openai: bool) -> Result<(), Box<dyn Error>> {
        let provider = if use_openai {
            TTSProvider::OpenAI
        } else {
            TTSProvider::Sonata
        };
        let command = SpeechCommand::SetTTSProvider(provider);
        self.sender.lock().await.send(command).await.map_err(|e| Box::new(SpeechError::from(e)))?;
        Ok(())
    }
}

pub struct SpeechWs {
    hb: Instant,
    websocket_manager: Arc<WebSocketManager>,
    settings: Arc<RwLock<Settings>>,
}

impl SpeechWs {
    pub fn new(websocket_manager: Arc<WebSocketManager>, settings: Arc<RwLock<Settings>>) -> Self {
        Self {
            hb: Instant::now(),
            websocket_manager,
            settings,
        }
    }

    fn hb(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_later(Duration::from_secs(0), |act, ctx| {
            act.check_heartbeat(ctx);
            ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
                act.check_heartbeat(ctx);
            });
        });
    }

    fn check_heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        if Instant::now().duration_since(self.hb) > CLIENT_TIMEOUT {
            info!("Websocket Client heartbeat failed, disconnecting!");
            ctx.close(None);
            return;
        }
        ctx.ping(b"");
    }
}

impl Actor for SpeechWs {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for SpeechWs {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                self.hb = Instant::now();
            }
            Ok(ws::Message::Text(text)) => {
                debug!("Received text message: {}", text);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let (Some(message), Some(use_openai)) = (json["message"].as_str(), json["useOpenAI"].as_bool()) {
                        let speech_service = SpeechService::new(
                            Arc::clone(&self.websocket_manager),
                            Arc::clone(&self.settings)
                        );
                        let message = message.to_string();
                        actix::spawn(async move {
                            if let Err(e) = speech_service.set_tts_provider(use_openai).await {
                                error!("Failed to set TTS provider: {}", e);
                            }
                            if let Err(e) = speech_service.send_message(message).await {
                                error!("Failed to send message: {}", e);
                            }
                        });
                    }
                }
            }
            Ok(ws::Message::Binary(bin)) => {
                debug!("Received binary message of {} bytes", bin.len());
                ctx.binary(bin);
            }
            Ok(ws::Message::Close(reason)) => {
                info!("Closing websocket connection: {:?}", reason);
                ctx.close(reason);
                return;
            }
            _ => (),
        }
    }
}

pub async fn start_websocket(
    req: HttpRequest,
    stream: web::Payload,
    websocket_manager: web::Data<Arc<WebSocketManager>>,
    settings: web::Data<Arc<RwLock<Settings>>>,
) -> Result<HttpResponse, ActixError> {
    let ws = SpeechWs::new(Arc::clone(&websocket_manager), Arc::clone(&settings));
    ws::start(ws, &req, stream)
}
