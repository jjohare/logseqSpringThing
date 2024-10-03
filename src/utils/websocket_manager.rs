// websocket_manager.rs

use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use actix::prelude::*;
use crate::AppState;
use log::{info, error, debug};
use std::sync::Mutex;
use serde_json::{json, Value};
use futures::future::join_all;
use std::collections::HashMap; // Import HashMap

/// Manages WebSocket connections and broadcasts updates to connected clients.
pub struct WebSocketManager {
    pub sessions: Mutex<Vec<Addr<WebSocketSession>>>,
}

impl WebSocketManager {
    /// Creates a new WebSocketManager instance.
    pub fn new() -> Self {
        WebSocketManager {
            sessions: Mutex::new(Vec::new()),
        }
    }

    /// Sets up a WebSocket route handler.
    pub async fn handle_websocket(req: HttpRequest, stream: web::Payload, state: web::Data<AppState>) -> Result<HttpResponse, Error> {
        let session = WebSocketSession::new(state.clone());
        let resp = ws::start(session, &req, stream)?;
        Ok(resp)
    }

    /// Broadcasts a message to all connected WebSocket clients.
    pub async fn broadcast_message(&self, message: &str) -> Result<(), Box<dyn std::error::Error>> {
        let sessions = self.sessions.lock().unwrap().clone();
        let futures = sessions.iter().map(|session| {
            session.send(BroadcastMessage(message.to_string()))
        });
        
        join_all(futures).await;
        debug!("Broadcasted message to {} sessions", sessions.len());
        Ok(())
    }
}

/// Represents a WebSocket session with a client.
pub struct WebSocketSession {
    state: web::Data<AppState>,
}

impl WebSocketSession {
    /// Creates a new WebSocketSession instance.
    fn new(state: web::Data<AppState>) -> Self {
        WebSocketSession { state }
    }

    /// Sends a JSON response to the client.
    fn send_json_response(&self, ctx: &mut ws::WebsocketContext<Self>, data: Value) {
        if let Ok(json_string) = serde_json::to_string(&data) {
            ctx.text(json_string.clone());
            debug!("Sent JSON response: {}", json_string);
        } else {
            error!("Failed to serialize JSON response");
        }
    }

    /// Handles the getInitialData request
    fn handle_get_initial_data(&self, ctx: &mut ws::WebsocketContext<Self>) {
        let state = self.state.clone();
        let fut = async move {
            let graph_data = state.graph_data.read().await;
            let file_sizes: HashMap<String, usize> = graph_data.metadata.iter().map(|(key, metadata)| (key.clone(), metadata.file_size)).collect();
            let response = json!({
                "type": "graphUpdate",
                "graphData": {
                    "nodes": graph_data.nodes,
                    "edges": graph_data.edges,
                    "fileSizes": file_sizes, // Include file sizes in the response
                }
            });
            debug!("Prepared initial graph data: {} nodes, {} edges", graph_data.nodes.len(), graph_data.edges.len());
            response
        };

        let actor_fut = fut.into_actor(self).map(|response, act, ctx| {
            act.send_json_response(ctx, response);
        });

        ctx.spawn(actor_fut);
    }
}

impl Actor for WebSocketSession {
    type Context = ws::WebsocketContext<Self>;

    /// Called when the WebSocket session is started.
    fn started(&mut self, ctx: &mut Self::Context) {
        let addr = ctx.address();
        self.state.websocket_manager.sessions.lock().unwrap().push(addr);
        info!("WebSocket session started. Total sessions: {}", self.state.websocket_manager.sessions.lock().unwrap().len());
    }

    /// Called when the WebSocket session is stopped.
    fn stopped(&mut self, ctx: &mut Self::Context) {
        let addr = ctx.address();
        self.state.websocket_manager.sessions.lock().unwrap().retain(|session| session != &addr);
        info!("WebSocket session stopped. Total sessions: {}", self.state.websocket_manager.sessions.lock().unwrap().len());
    }
}

/// Message for broadcasting data to WebSocket clients.
#[derive(Message)]
#[rtype(result = "()")]
struct BroadcastMessage(String);

impl Handler<BroadcastMessage> for WebSocketSession {
    type Result = ();

    /// Handles the broadcast message by sending it to the client.
    fn handle(&mut self, msg: BroadcastMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0);
        debug!("Broadcasted message to client");
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketSession {
    /// Handles incoming WebSocket messages from the client.
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                ctx.pong(&msg);
            },
            Ok(ws::Message::Pong(_)) => {
                // Optionally handle pong responses.
            },
            Ok(ws::Message::Text(text)) => {
                info!("Received message from client: {}", text);
                // Parse the incoming message as JSON
                match serde_json::from_str::<Value>(&text) {
                    Ok(json_data) => {
                        // Process the JSON data here
                        if let Some(msg_type) = json_data["type"].as_str() {
                            match msg_type {
                                "getInitialData" => {
                                    debug!("Handling getInitialData request");
                                    self.handle_get_initial_data(ctx);
                                },
                                _ => {
                                    // For other message types, just echo back for now
                                    let response = json!({
                                        "type": "echo",
                                        "received": json_data,
                                    });
                                    self.send_json_response(ctx, response);
                                }
                            }
                        } else {
                            error!("Received message without a type field");
                            let error_response = json!({
                                "type": "error",
                                "message": "Message type not specified",
                            });
                            self.send_json_response(ctx, error_response);
                        }
                    },
                    Err(e) => {
                        error!("Failed to parse incoming message as JSON: {}", e);
                        let error_response = json!({
                            "type": "error",
                            "message": "Invalid JSON format",
                        });
                        self.send_json_response(ctx, error_response);
                    }
                }
            },
            Ok(ws::Message::Binary(bin)) => {
                // Handle binary messages if necessary.
                let bin_clone = bin.clone();
                ctx.binary(bin);
                debug!("Received binary message of {} bytes", bin_clone.len());
            },
            Ok(ws::Message::Close(reason)) => {
                info!("WebSocket closed: {:?}", reason);
                ctx.stop();
            },
            _ => (),
        }
    }
}
