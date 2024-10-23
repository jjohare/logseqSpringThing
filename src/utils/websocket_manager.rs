use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use actix::prelude::*;
use crate::AppState;
use log::{info, error, debug};
use std::sync::{Mutex, Arc};
use serde_json::{json, Value};
use serde::{Deserialize, Serialize};
use flate2::read::DeflateDecoder;
use flate2::write::DeflateEncoder;
use flate2::Compression;
use std::io::prelude::*;
use futures::stream::{Stream, StreamExt};
use futures::SinkExt;
use std::pin::Pin;
use tokio::sync::RwLock;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::connect_async;
use url::Url;
use std::error::Error as StdError;

use base64::Engine as Base64Engine;
use base64::engine::general_purpose::STANDARD;

use crate::models::simulation_params::SimulationMode;
use crate::services::ragflow_service::RAGFlowError;
use crate::config::Settings;

/// Compresses a string message using raw deflate (compatible with pako).
fn compress_message(message: &str) -> Result<Vec<u8>, Box<dyn StdError + Send + Sync>> {
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(6));
    encoder.write_all(message.as_bytes())?;
    let compressed = encoder.finish()?;
    debug!("Compressed message size: {} bytes", compressed.len());
    Ok(compressed)
}

/// Decompresses binary data into a string message using raw deflate (compatible with pako).
fn decompress_message(data: &[u8]) -> Result<String, Box<dyn StdError + Send + Sync>> {
    debug!("Attempting to decompress message of size: {} bytes", data.len());
    let mut decoder = DeflateDecoder::new(data);
    let mut decompressed = String::new();
    decoder.read_to_string(&mut decompressed)?;
    debug!("Decompressed message size: {} bytes", decompressed.len());
    Ok(decompressed)
}

/// Represents messages sent to the client as compressed binary data.
#[derive(Message)]
#[rtype(result = "()")]
struct SendCompressedMessage(Vec<u8>);

/// Represents messages sent from the client.
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
enum ClientMessage {
    #[serde(rename = "setTTSMethod")]
    SetTTSMethod { method: String },
    #[serde(rename = "chatMessage")]
    ChatMessage { message: String, use_openai: bool },
    #[serde(rename = "getInitialData")]
    GetInitialData,
}

/// Manages WebSocket sessions and communication.
pub struct WebSocketManager {
    pub sessions: Mutex<Vec<Addr<WebSocketSession>>>,
    pub conversation_id: Arc<Mutex<Option<String>>>,
}

impl WebSocketManager {
    /// Creates a new WebSocketManager instance.
    pub fn new() -> Self {
        WebSocketManager {
            sessions: Mutex::new(Vec::new()),
            conversation_id: Arc::new(Mutex::new(None)),
        }
    }

    /// Initializes the WebSocketManager with a conversation ID.
    pub async fn initialize(&self, ragflow_service: &crate::services::ragflow_service::RAGFlowService) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let conversation_id = ragflow_service.create_conversation("default_user".to_string()).await?;
        let mut conv_id_lock = self.conversation_id.lock().unwrap();
        *conv_id_lock = Some(conversation_id.clone());
        info!("Initialized conversation with ID: {}", conversation_id);
        Ok(())
    }

    /// Handles incoming WebSocket connection requests.
    pub async fn handle_websocket(&self, req: HttpRequest, stream: web::Payload, state: web::Data<AppState>) -> Result<HttpResponse, Error> {
        info!("New WebSocket connection request");
        let session = WebSocketSession::new(state.clone(), Some(self.conversation_id.clone()));
        ws::start(session, &req, stream)
    }

    /// Broadcasts a compressed message to all connected WebSocket sessions.
    pub async fn broadcast_message_compressed(&self, message: &str) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let compressed = compress_message(message)?;
        let sessions = self.sessions.lock().unwrap().clone();
        for session in sessions.iter() {
            session.do_send(SendCompressedMessage(compressed.clone()));
        }
        Ok(())
    }

    /// Broadcasts audio data to all connected WebSocket sessions.
    pub async fn broadcast_audio(&self, audio_bytes: Vec<u8>) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let json_data = json!({
            "type": "audio",
            "audioData": STANDARD.encode(&audio_bytes)
        });
        let message = json_data.to_string();
        self.broadcast_message_compressed(&message).await
    }
}

/// Represents messages to be broadcasted as compressed binary data.
#[derive(Message)]
#[rtype(result = "()")]
pub struct BroadcastMessage(pub String);

/// Represents a stream of RAGFlow responses.
#[derive(Message)]
#[rtype(result = "()")]
struct StreamRAGFlowResponse(Pin<Box<dyn Stream<Item = Result<(String, Vec<u8>), RAGFlowError>> + Send>>);

/// Represents a query error from RAGFlow.
#[derive(Message)]
#[rtype(result = "()")]
struct RAGFlowQueryError(RAGFlowError);

/// Represents the result of an OpenAI query.
#[derive(Message)]
#[rtype(result = "()")]
struct OpenAIQueryResult(Result<String, String>);

/// Represents audio data to be broadcasted.
#[derive(Message)]
#[rtype(result = "()")]
pub struct BroadcastAudio(pub Vec<u8>);

/// WebSocket session actor.
pub struct WebSocketSession {
    state: web::Data<AppState>,
    tts_method: String,
    openai_ws: Option<Addr<OpenAIWebSocket>>,
    simulation_mode: SimulationMode,
    conversation_id: Option<Arc<Mutex<Option<String>>>>,
}

impl WebSocketSession {
    pub fn new(state: web::Data<AppState>, conversation_id: Option<Arc<Mutex<Option<String>>>>) -> Self {
        WebSocketSession {
            state,
            tts_method: "piper".to_string(), // Default to Piper
            openai_ws: None,
            simulation_mode: SimulationMode::default(),
            conversation_id,
        }
    }

    /// Handles incoming messages from the client.
    fn handle_incoming_message(&mut self, msg: String, ctx: &mut ws::WebsocketContext<Self>) {
        debug!("Received message: {}", msg);
        match serde_json::from_str::<ClientMessage>(&msg) {
            Ok(client_msg) => {
                match client_msg {
                    ClientMessage::SetTTSMethod { method } => {
                        info!("Setting TTS method to {}", method);
                        self.tts_method = method.clone();
                        let response = json!({
                            "type": "ttsMethodSet",
                            "method": method
                        });
                        self.send_json_response(response, ctx);
                    },
                    ClientMessage::ChatMessage { message, use_openai } => {
                        info!("Received chat message: {}", message);
                        if use_openai {
                            if let Some(ref openai_ws) = self.openai_ws {
                                openai_ws.do_send(OpenAIMessage(message));
                            } else {
                                error!("OpenAI WebSocket not initialized");
                                let error_message = json!({
                                    "type": "error",
                                    "message": "OpenAI WebSocket not initialized"
                                });
                                self.send_json_response(error_message, ctx);
                            }
                        } else {
                            // Implement RAGFlow chat logic here
                            let response = json!({
                                "type": "ragflowResponse",
                                "message": format!("RAGFlow: {}", message)
                            });
                            self.send_json_response(response, ctx);
                        }
                    },
                    ClientMessage::GetInitialData => {
                        info!("Client requested initial data");
                        let initial_data = json!({
                            "type": "initialData",
                            "data": {
                                "message": "Welcome to the WebSocket server!"
                            }
                        });
                        self.send_json_response(initial_data, ctx);
                    },
                }
            },
            Err(e) => {
                error!("Failed to parse client message: {}. Raw message: {}", e, msg);
                let error_message = json!({
                    "type": "error",
                    "message": "Invalid message format"
                });
                self.send_json_response(error_message, ctx);
            },
        }
    }

    /// Sends a JSON response to the client
    fn send_json_response(&self, response: Value, ctx: &mut ws::WebsocketContext<Self>) {
        if let Ok(json_string) = serde_json::to_string(&response) {
            debug!("Sending JSON response: {}", json_string);
            if let Ok(compressed) = compress_message(&json_string) {
                ctx.binary(compressed.clone());
                debug!("Sent compressed message, size: {} bytes", compressed.len());
            } else {
                error!("Failed to compress JSON response");
            }
        } else {
            error!("Failed to serialize JSON response");
        }
    }
}

impl Actor for WebSocketSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let addr = ctx.address();
        self.state.websocket_manager.sessions.lock().unwrap().push(addr.clone());
        info!(
            "WebSocket session started. Total sessions: {}",
            self.state.websocket_manager.sessions.lock().unwrap().len()
        );

        // Initialize OpenAI WebSocket
        self.openai_ws = Some(OpenAIWebSocket::new(ctx.address(), self.state.settings.clone()).start());
    }

    fn stopped(&mut self, ctx: &mut Self::Context) {
        let addr = ctx.address();
        self.state.websocket_manager.sessions.lock().unwrap().retain(|session| session != &addr);
        info!(
            "WebSocket session stopped. Total sessions: {}",
            self.state.websocket_manager.sessions.lock().unwrap().len()
        );
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                ctx.pong(&msg);
            },
            Ok(ws::Message::Pong(_)) => (),
            Ok(ws::Message::Text(text)) => {
                debug!("Received text message: {}", text);
                self.handle_incoming_message(text.to_string(), ctx);
            },
            Ok(ws::Message::Binary(bin)) => {
                debug!("Received binary message of size: {} bytes", bin.len());
                match decompress_message(&bin) {
                    Ok(text) => self.handle_incoming_message(text, ctx),
                    Err(e) => {
                        error!("Failed to decompress message: {}. Message size: {} bytes", e, bin.len());
                        let error_message = json!({
                            "type": "error",
                            "message": format!("Failed to decompress message: {}", e)
                        });
                        self.send_json_response(error_message, ctx);
                    },
                }
            },
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            },
            Err(e) => {
                error!("WebSocket error: {}", e);
                ctx.stop();
            },
            _ => (),
        }
    }
}

impl Handler<OpenAIQueryResult> for WebSocketSession {
    type Result = ();

    fn handle(&mut self, msg: OpenAIQueryResult, ctx: &mut Self::Context) {
        match msg.0 {
            Ok(response) => {
                let message = json!({
                    "type": "openaiResponse",
                    "response": response
                });
                self.send_json_response(message, ctx);
            },
            Err(error) => {
                let error_message = json!({
                    "type": "error",
                    "message": format!("OpenAI error: {}", error)
                });
                self.send_json_response(error_message, ctx);
            }
        }
    }
}

/// OpenAI WebSocket actor
#[derive(Clone)]
struct OpenAIWebSocket {
    client_addr: Addr<WebSocketSession>,
    ws_stream: Arc<tokio::sync::Mutex<Option<WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>>>,
    settings: Arc<RwLock<Settings>>,
}

impl OpenAIWebSocket {
    fn new(client_addr: Addr<WebSocketSession>, settings: Arc<RwLock<Settings>>) -> Self {
        OpenAIWebSocket {
            client_addr,
            ws_stream: Arc::new(tokio::sync::Mutex::new(None)),
            settings,
        }
    }

    async fn connect_to_openai(&self) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let settings = self.settings.read().await;
        let url = Url::parse(&settings.openai.openai_base_url)?;
        let api_key = settings.openai.openai_api_key.clone();
        drop(settings);  // Release the lock before the await point
        
        let request = http::Request::builder()
            .uri(url.as_str())
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .body(())?;

        let (ws_stream, _) = connect_async(request).await?;
        *self.ws_stream.lock().await = Some(ws_stream);
        Ok(())
    }
}

#[async_trait::async_trait]
pub trait OpenAIRealtimeHandler: Send + Sync {
    async fn send_text_message(&self, text: &str) -> Result<(), Box<dyn StdError + Send + Sync>>;
    async fn handle_openai_responses(&self) -> Result<(), Box<dyn StdError + Send + Sync>>;
}

#[async_trait::async_trait]
impl OpenAIRealtimeHandler for OpenAIWebSocket {
    async fn send_text_message(&self, text: &str) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let mut ws_stream_guard = self.ws_stream.lock().await;
        let ws_stream = ws_stream_guard.as_mut().ok_or_else(|| Box::new(std::io::Error::new(std::io::ErrorKind::Other, "WebSocket not connected")) as Box<dyn StdError + Send + Sync>)?;

        let request = json!({
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": text
                    }
                ]
            }
        });

        ws_stream.send(Message::Text(request.to_string())).await?;
        
        Ok(())
    }

    async fn handle_openai_responses(&self) -> Result<(), Box<dyn StdError + Send + Sync>> {
        let mut ws_stream_guard = self.ws_stream.lock().await;
        let ws_stream = ws_stream_guard.as_mut().ok_or_else(|| Box::new(std::io::Error::new(std::io::ErrorKind::Other, "WebSocket not connected")) as Box<dyn StdError + Send + Sync>)?;
        let client_addr = self.client_addr.clone();

        while let Some(response) = ws_stream.next().await {
            match response {
                Ok(Message::Text(text)) => {
                    let json_msg: serde_json::Value = serde_json::from_str(&text)?;

                    if let Some(audio_data) = json_msg["delta"]["audio"].as_str() {
                        let audio_bytes = STANDARD.decode(audio_data)?;

                        let audio_message = json!({
                            "type": "audio",
                            "audioData": STANDARD.encode(&audio_bytes)
                        });

                        client_addr.do_send(SendCompressedMessage(audio_message.to_string().into_bytes()));
                    } else if json_msg["type"].as_str() == Some("response.text.done") {
                        break;
                    }
                },
                Ok(Message::Close(_)) => {
                    info!("OpenAI WebSocket connection closed by server");
                    break;
                },
                Err(e) => {
                    error!("Error receiving message from OpenAI: {}", e);
                    client_addr.do_send(OpenAIQueryResult(Err(format!("Error receiving message: {}", e))));
                    break;
                },
                _ => {
                    // Ignore other message types
                }
            }
        }

        Ok(())
    }
}

impl Actor for OpenAIWebSocket {
    type Context = Context<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        info!("OpenAI WebSocket started");
        let addr = ctx.address();
        let settings = self.settings.clone();
        let ws_stream = self.ws_stream.clone();
        
        ctx.spawn(async move {
            let result = async {
                let settings_read = settings.read().await;
                let url = Url::parse(&settings_read.openai.openai_base_url)?;
                let api_key = settings_read.openai.openai_api_key.clone();
                drop(settings_read);

                let request = http::Request::builder()
                    .uri(url.as_str())
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .body(())?;

                let (ws_stream_new, _) = connect_async(request).await?;
                *ws_stream.lock().await = Some(ws_stream_new);
                Ok::<_, Box<dyn StdError + Send + Sync>>(())
            }.await;

            match result {
                Ok(_) => {
                    info!("Connected to OpenAI WebSocket");
                    addr.do_send(OpenAIConnected);
                }
                Err(e) => {
                    error!("Failed to connect to OpenAI WebSocket: {}", e);
                    addr.do_send(OpenAIConnectionFailed);
                }
            }
        }.into_actor(self));
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        info!("OpenAI WebSocket stopped");
    }
}

#[derive(Message)]
#[rtype(result = "()")]
struct OpenAIConnected;

#[derive(Message)]
#[rtype(result = "()")]
struct OpenAIConnectionFailed;

impl Handler<OpenAIConnected> for OpenAIWebSocket {
    type Result = ();

    fn handle(&mut self, _msg: OpenAIConnected, _ctx: &mut Self::Context) {
        // Handle successful connection if needed
    }
}

impl Handler<OpenAIConnectionFailed> for OpenAIWebSocket {
    type Result = ();

    fn handle(&mut self, _msg: OpenAIConnectionFailed, ctx: &mut Self::Context) {
        ctx.stop();
    }
}

#[derive(Message)]
#[rtype(result = "()")]
struct OpenAIMessage(String);

impl Handler<OpenAIMessage> for OpenAIWebSocket {
    type Result = ResponseActFuture<Self, ()>;

    fn handle(&mut self, msg: OpenAIMessage, _ctx: &mut Self::Context) -> Self::Result {
        let text_message = msg.0;
        let this = self.clone();

        Box::pin(async move {
            if let Err(e) = this.send_text_message(&text_message).await {
                error!("Error sending message to OpenAI: {}", e);
            }
            if let Err(e) = this.handle_openai_responses().await {
                error!("Error handling OpenAI responses: {}", e);
            }
            ()
        }.into_actor(self))
    }
}

impl Handler<SendCompressedMessage> for WebSocketSession {
    type Result = ();

    fn handle(&mut self, msg: SendCompressedMessage, ctx: &mut Self::Context) {
        ctx.binary(msg.0);
    }
}

/// Handles sending JSON responses to the WebSocket client.
#[derive(Message)]
#[rtype(result = "()")]
struct SendJsonResponse(Value);

impl Handler<SendJsonResponse> for WebSocketSession {
    type Result = ();

    fn handle(&mut self, msg: SendJsonResponse, ctx: &mut Self::Context) {
        self.send_json_response(msg.0, ctx);
    }
}
