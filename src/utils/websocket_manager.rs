use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use actix::prelude::*;
use crate::AppState;
use log::{info, error, debug};
use std::sync::{Mutex, Arc};
use tokio::sync::RwLock;
use serde_json::{json, Value};
use serde::{Deserialize, Serialize};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::prelude::*;
use futures::stream::Stream;
use std::pin::Pin;
use tokio_tungstenite::WebSocketStream;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::connect_async;
use url::Url;
use futures::{SinkExt, StreamExt};

use base64::Engine as Base64Engine;
use base64::engine::general_purpose::STANDARD;

use crate::models::simulation_params::SimulationMode;
use crate::services::ragflow_service::RAGFlowError;
use crate::config::Settings;

// ... (keep the existing functions: compress_message, decompress_message)

// ... (keep the existing structs and enums)

impl WebSocketManager {
    // ... (keep the existing methods)
}

// ... (keep the existing message structs)

impl WebSocketSession {
    // ... (keep the existing methods)
}

impl Actor for WebSocketSession {
    // ... (keep the existing implementation)
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketSession {
    // ... (keep the existing implementation)
}

impl Handler<OpenAIQueryResult> for WebSocketSession {
    // ... (keep the existing implementation)
}

struct OpenAIWebSocket {
    client_addr: Addr<WebSocketSession>,
    ws_stream: Option<WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>>,
    settings: Arc<RwLock<Settings>>,
}

impl OpenAIWebSocket {
    fn new(client_addr: Addr<WebSocketSession>, settings: Arc<RwLock<Settings>>) -> Self {
        OpenAIWebSocket {
            client_addr,
            ws_stream: None,
            settings,
        }
    }

    async fn connect_to_openai(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let settings = self.settings.read().await;
        let url = Url::parse(&settings.openai.openai_base_url)?;
        let api_key = settings.openai.openai_api_key.clone();
        
        let request = http::Request::builder()
            .uri(url.as_str())
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .body(())?;

        let (ws_stream, _) = connect_async(request).await?;
        self.ws_stream = Some(ws_stream);
        Ok(())
    }
}

impl Actor for OpenAIWebSocket {
    type Context = Context<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        info!("OpenAI WebSocket started");
        let fut = self.connect_to_openai();
        ctx.spawn(fut.into_actor(self).map(|res, act, ctx| {
            match res {
                Ok(_) => info!("Connected to OpenAI WebSocket"),
                Err(e) => {
                    error!("Failed to connect to OpenAI WebSocket: {}", e);
                    ctx.stop();
                }
            }
        }));
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        info!("OpenAI WebSocket stopped");
    }
}

#[derive(Message)]
#[rtype(result = "()")]
struct OpenAIMessage(String);

impl Handler<OpenAIMessage> for OpenAIWebSocket {
    type Result = ResponseActFuture<Self, ()>;

    fn handle(&mut self, msg: OpenAIMessage, _ctx: &mut Self::Context) -> Self::Result {
        let ws_stream = self.ws_stream.take();
        let client_addr = self.client_addr.clone();

        Box::pin(async move {
            if let Some(mut ws_stream) = ws_stream {
                let message = Message::Text(msg.0);
                if let Err(e) = ws_stream.send(message).await {
                    error!("Failed to send message to OpenAI: {}", e);
                    client_addr.do_send(OpenAIQueryResult(Err(format!("Failed to send message to OpenAI: {}", e))));
                } else {
                    if let Some(response) = ws_stream.next().await {
                        match response {
                            Ok(Message::Text(text)) => {
                                client_addr.do_send(OpenAIQueryResult(Ok(text)));
                            }
                            Ok(_) => {
                                error!("Received unexpected message type from OpenAI");
                                client_addr.do_send(OpenAIQueryResult(Err("Received unexpected message type from OpenAI".to_string())));
                            }
                            Err(e) => {
                                error!("Error receiving message from OpenAI: {}", e);
                                client_addr.do_send(OpenAIQueryResult(Err(format!("Error receiving message from OpenAI: {}", e))));
                            }
                        }
                    } else {
                        error!("OpenAI WebSocket stream closed unexpectedly");
                        client_addr.do_send(OpenAIQueryResult(Err("OpenAI WebSocket stream closed unexpectedly".to_string())));
                    }
                }
            } else {
                error!("OpenAI WebSocket not connected");
                client_addr.do_send(OpenAIQueryResult(Err("OpenAI WebSocket not connected".to_string())));
            }
        }
        .into_actor(self)
        .map(move |_, act, _| {
            act.ws_stream = ws_stream;
        }))
    }
}

// ... (keep the existing Handler implementations for WebSocketSession)
