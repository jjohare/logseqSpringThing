use actix::prelude::*;
use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use flate2::{read::ZlibDecoder, write::ZlibEncoder, Compression};
use glam::Vec3;
use log::{debug, error, info, warn};
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::app_state::AppState;
use crate::utils::binary_protocol::{self, MessageType, NodeData};
use crate::utils::socket_flow_messages::{PingMessage, PongMessage};

pub struct SocketFlowServer {
    app_state: Arc<AppState>,
    settings: Arc<RwLock<crate::config::Settings>>,
    last_ping: Option<u64>,
    update_interval: std::time::Duration,
}

impl SocketFlowServer {
    pub fn new(app_state: Arc<AppState>, settings: Arc<RwLock<crate::config::Settings>>) -> Self {
        // Calculate update interval from settings
        let update_rate = settings
            .try_read()
            .map(|s| s.system.websocket.binary_update_rate)
            .unwrap_or(30);

        let update_interval =
            std::time::Duration::from_millis((1000.0 / update_rate as f64) as u64);

        Self {
            app_state,
            settings,
            last_ping: None,
            update_interval,
        }
    }

    fn handle_ping(&mut self, msg: PingMessage) -> PongMessage {
        self.last_ping = Some(msg.timestamp);
        PongMessage {
            type_: "pong".to_string(),
            timestamp: msg.timestamp,
        }
    }

    fn maybe_compress(&self, data: Vec<u8>) -> Vec<u8> {
        if let Ok(settings) = self.settings.try_read() {
            if settings.system.websocket.compression_enabled
                && data.len() >= settings.system.websocket.compression_threshold
            {
                let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
                if encoder.write_all(&data).is_ok() {
                    if let Ok(compressed) = encoder.finish() {
                        if compressed.len() < data.len() {
                            debug!("Compressed binary message: {} -> {} bytes", data.len(), compressed.len());
                            return compressed;
                        }
                    }
                }
            }
        }
        data
    }

    fn maybe_decompress(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        if let Ok(settings) = self.settings.try_read() {
            if settings.system.websocket.compression_enabled {
                let mut decoder = ZlibDecoder::new(data.as_slice());
                let mut decompressed = Vec::new();
                match decoder.read_to_end(&mut decompressed) {
                    Ok(_) => {
                        if decompressed.len() > data.len() {
                            debug!("Decompressed binary message: {} -> {} bytes", data.len(), decompressed.len());
                            return Ok(decompressed);
                        }
                    }
                    Err(e) => {
                        debug!("Decompression failed (data likely uncompressed): {}", e);
                    }
                }
            }
        }
        Ok(data)
    }
}

impl Actor for SocketFlowServer {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        info!("[WebSocket] Client connected from {:?}", ctx.address());

        // Send simple connection established message
        let response = serde_json::json!({
            "type": "connection_established",
            "timestamp": chrono::Utc::now().timestamp_millis()
        });

        if let Ok(msg_str) = serde_json::to_string(&response) {
            ctx.text(msg_str);
        }
    }

    fn stopped(&mut self, _: &mut Self::Context) {
        info!("[WebSocket] Client disconnected");
        // Cleanup any resources if needed
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for SocketFlowServer {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                debug!("[WebSocket] Received ping");
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                debug!("[WebSocket] Received pong");
                // Update last pong time if needed
            }
            Ok(ws::Message::Text(text)) => {
                info!("Received text message: {}", text);
                match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(msg) => {
                        match msg.get("type").and_then(|t| t.as_str()) {
                            Some("ping") => {
                                if let Ok(ping_msg) =
                                    serde_json::from_value::<PingMessage>(msg.clone())
                                {
                                    let pong = self.handle_ping(ping_msg);
                                    if let Ok(response) = serde_json::to_string(&pong) {
                                        ctx.text(response);
                                    }
                                }
                            }
                            Some("requestInitialData") => {
                                // Start sending GPU-computed position updates
                                let app_state = self.app_state.clone();
                                
                                ctx.run_interval(self.update_interval, move |act, ctx| {
                                    let app_state_clone = app_state.clone();

                                    let fut = async move {
                                        let raw_nodes = app_state_clone
                                            .graph_service
                                            .get_node_positions()
                                            .await;

                                        // Only process and send updates if we have nodes
                                        if !raw_nodes.is_empty() {
                                            // Check debug settings
                                            let should_debug = if let Ok(settings) = app_state_clone.settings.try_read() {
                                                settings.system.debug.enabled && 
                                                settings.system.debug.enable_websocket_debug
                                            } else {
                                                 false
                                           };
                                            if should_debug {
                                                debug!("Processing binary update for {} nodes", raw_nodes.len());
                                            }
                                            let nodes: Vec<NodeData> = raw_nodes
                                                .into_iter()
                                                .map(|node| NodeData {
                                                    id: node.id.parse().unwrap_or(0),
                                                    position: Vec3::new(
                                                        node.data.position[0],
                                                        node.data.position[1],
                                                        node.data.position[2],
                                                    ),
                                                    velocity: Vec3::new(
                                                        node.data.velocity[0],
                                                        node.data.velocity[1],
                                                        node.data.velocity[2],
                                                    ),
                                                })
                                                .collect::<Vec<_>>();

                                            if should_debug {
                                                debug!("Encoding binary update with {} nodes", nodes.len());
                                            }
                                            let data = binary_protocol::encode_node_data(
                                                &nodes,
                                                MessageType::PositionVelocityUpdate,
                                            );
                                            if should_debug {
                                                debug!("Binary message size: {} bytes", data.len());
                                            }
                                            Some(data)
                                        } else {
                                            // Skip debug log when no nodes to update
                                            None
                                        }
                                    };

                                    let fut = fut.into_actor(act);
                                    ctx.spawn(fut.map(|maybe_binary_data, act, ctx| {
                                        if let Some(binary_data) = maybe_binary_data {
                                            let final_data = act.maybe_compress(binary_data);
                                            ctx.binary(final_data);
                                        }
                                        // Do not send any message if there are no nodes
                                    }));
                                });

                                // Send confirmation that updates are starting
                                let response = serde_json::json!({
                                    "type": "updatesStarted",
                                    "timestamp": chrono::Utc::now().timestamp_millis()
                                });
                                if let Ok(msg_str) = serde_json::to_string(&response) {
                                    ctx.text(msg_str);
                                }
                            }
                            _ => {
                                warn!("[WebSocket] Unknown message type: {:?}", msg);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("[WebSocket] Failed to parse text message: {}", e);
                    }
                }
            }
            Ok(ws::Message::Binary(data)) => {
                info!("Received binary message, length: {}", data.len());
                // Handle user interaction updates
                match binary_protocol::decode_node_data(&data) {
                    Ok((msg_type, nodes)) => {
                        if nodes.len() <= 2 {
                            // Only allow updates for up to 2 nodes during interaction
                            match msg_type {
                                MessageType::PositionVelocityUpdate => {
                                    // Update positions in graph service for interacted nodes
                                    let app_state = self.app_state.clone();
                                    let nodes_clone = nodes.clone();

                                    // Spawn a future to update the graph data
                                    let fut = async move {
                                        let mut graph =
                                            app_state.graph_service.graph_data.write().await;
                                        for node_data in nodes_clone {
                                            if let Some(node) = graph.nodes.iter_mut().find(|n| {
                                                n.id.parse::<u32>().unwrap_or(0) == node_data.id
                                            }) {
                                                // Update position and velocity from user interaction
                                                node.data.position = [
                                                    node_data.position.x,
                                                    node_data.position.y,
                                                    node_data.position.z,
                                                ];
                                                node.data.velocity = [
                                                    node_data.velocity.x,
                                                    node_data.velocity.y,
                                                    node_data.velocity.z,
                                                ];
                                            }
                                        }
                                    };

                                    let fut = fut.into_actor(self);
                                    ctx.spawn(fut.map(|_, _, _| ()));
                                }
                            }
                        } else {
                            warn!("Received update for too many nodes: {}", nodes.len());
                        }
                    }
                    Err(e) => error!("Failed to decode binary message: {}", e),
                }
            }
            Ok(ws::Message::Close(reason)) => {
                info!("[WebSocket] Client initiated close: {:?}", reason);
                ctx.close(reason);
                ctx.stop();
            }
            Ok(ws::Message::Continuation(_)) => {
                warn!("[WebSocket] Received unexpected continuation frame");
            }
            Ok(ws::Message::Nop) => {
                debug!("[WebSocket] Received Nop");
            }
            Err(e) => {
                error!("[WebSocket] Error in WebSocket connection: {}", e);
                ctx.stop();
            }
        }
    }
}

pub async fn socket_flow_handler(
    req: HttpRequest,
    stream: web::Payload,
    app_state: web::Data<AppState>,
    settings: web::Data<Arc<RwLock<crate::config::Settings>>>,
) -> Result<HttpResponse, Error> {
    let should_debug = settings.try_read().map(|s| {
        s.system.debug.enabled && s.system.debug.enable_websocket_debug
    }).unwrap_or(false);

    if should_debug {
        debug!("WebSocket connection attempt from {:?}", req.peer_addr());
    }

    // Check for WebSocket upgrade
    if !req.headers().contains_key("Upgrade") {
        return Ok(HttpResponse::BadRequest().body("WebSocket upgrade required"));
    }

    let ws = SocketFlowServer::new(app_state.into_inner(), settings.get_ref().clone());

    match ws::start(ws, &req, stream) {
        Ok(response) => {
            info!("[WebSocket] Client connected successfully");
            Ok(response)
        }
        Err(e) => {
            error!("[WebSocket] Failed to start WebSocket: {}", e);
            Err(e)
        }
    }
}
