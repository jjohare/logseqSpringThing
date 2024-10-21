use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use actix::prelude::*;
use crate::AppState;
use log::{info, error};
use std::sync::{Mutex, Arc};
use serde_json::{json, Value};
use serde::{Deserialize, Serialize};
use flate2::write::{GzEncoder, GzDecoder};
use flate2::Compression;
use std::io::prelude::*;
use futures::stream::Stream;
use std::pin::Pin;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::protocol::Message;

use base64::Engine as Base64Engine;
use base64::engine::general_purpose::STANDARD;

use crate::models::simulation_params::SimulationMode;
use crate::services::ragflow_service::RAGFlowError;

/// Compresses a string message using gzip.
fn compress_message(message: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(message.as_bytes())?;
    let compressed = encoder.finish()?;
    Ok(compressed)
}

/// Decompresses binary data into a string message using gzip.
fn decompress_message(data: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
    let mut decoder = GzDecoder::new(Vec::new());
    decoder.write_all(data)?;
    let decompressed = decoder.finish()?;
    String::from_utf8(decompressed).map_err(|e| e.into())
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
    pub async fn initialize(&self, ragflow_service: &crate::services::ragflow_service::RAGFlowService) -> Result<(), Box<dyn std::error::Error>> {
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

    /// Broadcasts a gzipped message to all connected WebSocket sessions.
    pub async fn broadcast_message_compressed(&self, message: &str) -> Result<(), Box<dyn std::error::Error>> {
        let compressed = compress_message(message)?;
        let sessions = self.sessions.lock().unwrap().clone();
        for session in sessions.iter() {
            session.do_send(SendCompressedMessage(compressed.clone()));
        }
        Ok(())
    }

    /// Broadcasts audio data to all connected WebSocket sessions.
    pub async fn broadcast_audio(&self, audio_bytes: Vec<u8>) -> Result<(), Box<dyn std::error::Error>> {
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
struct OpenAIQueryResult(Result<(), String>);

/// Represents audio data to be broadcasted.
#[derive(Message)]
#[rtype(result = "()")]
pub struct BroadcastAudio(pub Vec<u8>);

/// WebSocket session actor.
pub struct WebSocketSession {
    state: web::Data<AppState>,
    tts_method: String,
    #[allow(dead_code)]
    openai_ws: Option<WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>,
    simulation_mode: SimulationMode,
}

impl WebSocketSession {
    pub fn new(state: web::Data<AppState>, conversation_id: Option<Arc<Mutex<Option<String>>>>) -> Self {
        WebSocketSession {
            state,
            tts_method: "sonata".to_string(),
            openai_ws: None,
            simulation_mode: SimulationMode::default(),
        }
    }

    /// Handles incoming messages from the client.
    fn handle_incoming_message(&mut self, msg: String, ctx: &mut ws::WebsocketContext<Self>) {
        match serde_json::from_str::<ClientMessage>(&msg) {
            Ok(client_msg) => {
                match client_msg {
                    ClientMessage::SetTTSMethod { method } => {
                        // Handle setting TTS method
                        info!("Setting TTS method to {}", method);
                        // Implement the logic to update TTS method
                        self.tts_method = method;
                    },
                    ClientMessage::ChatMessage { message, use_openai } => {
                        // Handle chat message
                        info!("Received chat message: {}", message);
                        // Process the message and respond accordingly
                        // Example: Send the message to OpenAI and handle the response
                        if use_openai {
                            // Implement OpenAI chat logic here
                        } else {
                            // Implement non-OpenAI chat logic here
                        }
                    },
                }
            },
            Err(e) => {
                error!("Failed to parse client message: {}", e);
                let error_message = json!({
                    "type": "error",
                    "message": "Invalid message format"
                });
                if let Ok(json_string) = serde_json::to_string(&error_message) {
                    if let Ok(compressed) = compress_message(&json_string) {
                        ctx.binary(compressed);
                    } else {
                        error!("Failed to compress error message");
                    }
                }
            },
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
                self.handle_incoming_message(text.to_string(), ctx);
            },
            Ok(ws::Message::Binary(bin)) => {
                match decompress_message(&bin) {
                    Ok(text) => self.handle_incoming_message(text, ctx),
                    Err(e) => {
                        error!("Failed to decompress message: {}", e);
                        ctx.close(Some(ws::CloseReason::from((ws::CloseCode::Unsupported, "Failed to decompress message"))));
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

/// Handles sending compressed JSON responses to the WebSocket client.
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
        if let Ok(json_string) = serde_json::to_string(&msg.0) {
            // Compress the JSON string before sending
            match compress_message(&json_string) {
                Ok(compressed) => {
                    ctx.binary(compressed);
                },
                Err(e) => {
                    error!("Failed to compress JSON response: {}", e);
                }
            }
        } else {
            error!("Failed to serialize JSON response");
        }
    }
}
