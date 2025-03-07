use actix::prelude::*;
use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use flate2::{write::ZlibEncoder, Compression};
use log::{debug, error, info, warn};
use std::io::Write;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::RwLock;
use std::time::Instant;

use crate::app_state::AppState;
use crate::utils::binary_protocol;
use crate::types::vec3::Vec3Data;
use crate::utils::socket_flow_messages::{BinaryNodeData, PingMessage, PongMessage};

// Constants for throttling debug logs
const DEBUG_LOG_SAMPLE_RATE: usize = 10; // Only log 1 in 10 updates

// Constants for data optimization
const COMPRESSION_LEVEL: Compression = Compression::best(); // Use best compression
const POSITION_DEADBAND: f32 = 0.005; // 5mm deadband (reduced from 1cm)
const VELOCITY_DEADBAND: f32 = 0.001; // 1mm/s deadband for velocity

// Maximum value for u16 node IDs
const MAX_U16_VALUE: u32 = 65535;

pub struct SocketFlowServer {
    app_state: Arc<AppState>,
    settings: Arc<RwLock<crate::config::Settings>>,
    last_ping: Option<u64>,
    update_counter: usize, // Counter for throttling debug logs
    last_activity: std::time::Instant, // Track last activity time
    heartbeat_timer_set: bool, // Flag to track if heartbeat timer is set
    update_interval: std::time::Duration,
    // Fields for batched updates and deadband filtering
    node_position_cache: HashMap<String, BinaryNodeData>,
    last_sent_positions: HashMap<String, Vec3Data>,
    last_sent_velocities: HashMap<String, Vec3Data>,
    position_deadband: f32, // Minimum position change to trigger an update
    velocity_deadband: f32, // Minimum velocity change to trigger an update
    // Performance metrics
    last_transfer_size: usize,
    last_transfer_time: Instant,
    total_bytes_sent: usize,
    update_count: usize,
    nodes_sent_count: usize
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
            update_counter: 0,
            last_activity: std::time::Instant::now(),
            heartbeat_timer_set: false,
            update_interval,
            node_position_cache: HashMap::new(),
            last_sent_positions: HashMap::new(),
            last_sent_velocities: HashMap::new(),
            position_deadband: POSITION_DEADBAND,
            velocity_deadband: VELOCITY_DEADBAND,
            last_transfer_size: 0,
            last_transfer_time: Instant::now(),
            total_bytes_sent: 0,
            update_count: 0,
            nodes_sent_count: 0,
        }
    }

    fn handle_ping(&mut self, msg: PingMessage) -> PongMessage {
        self.last_ping = Some(msg.timestamp);
        PongMessage {
            type_: "pong".to_string(),
            timestamp: msg.timestamp,
        }
    }

    fn maybe_compress(&mut self, data: Vec<u8>) -> Vec<u8> {
        // Always compress data to reduce transfer size
        if data.len() > 100 { // Only compress if data is larger than 100 bytes
            let mut encoder = ZlibEncoder::new(Vec::new(), COMPRESSION_LEVEL);
            if encoder.write_all(&data).is_ok() {
                if let Ok(compressed) = encoder.finish() {
                    if compressed.len() < data.len() {
                        if self.should_log_update() {
                            debug!("Compressed binary message: {} -> {} bytes ({}% reduction)", 
                                data.len(), compressed.len(), 
                                ((data.len() - compressed.len()) * 100) / data.len());
                        }
                        return compressed;
                    }
                }
            }
        }
        data
    }
    
    // Helper method to determine if we should log this update (for throttling)
    fn should_log_update(&mut self) -> bool {
        self.update_counter = (self.update_counter + 1) % DEBUG_LOG_SAMPLE_RATE;
        self.update_counter == 0
    }
    
    // Check if a node's position or velocity has changed enough to warrant an update
    fn has_node_changed_significantly(&mut self, node_id: &str, new_position: Vec3Data, new_velocity: Vec3Data) -> bool {
        let position_changed = if let Some(last_position) = self.last_sent_positions.get(node_id) {
            // Calculate Euclidean distance between last sent position and new position
            let dx = new_position.x - last_position.x;
            let dy = new_position.y - last_position.y;
            let dz = new_position.z - last_position.z;
            let distance_squared = dx*dx + dy*dy + dz*dz;
            
            // Check if position has changed by more than the deadband
            distance_squared > self.position_deadband * self.position_deadband
        } else {
            // First time seeing this node, always consider it changed
            true
        };
        
        let velocity_changed = if let Some(last_velocity) = self.last_sent_velocities.get(node_id) {
            // Calculate velocity change magnitude
            let dvx = new_velocity.x - last_velocity.x;
            let dvy = new_velocity.y - last_velocity.y;
            let dvz = new_velocity.z - last_velocity.z;
            let velocity_change_squared = dvx*dvx + dvy*dvy + dvz*dvz;
            
            // Check if velocity has changed by more than the deadband
            velocity_change_squared > self.velocity_deadband * self.velocity_deadband
        } else {
            // First time seeing this node's velocity, always consider it changed
            true
        };
        
        // Update stored values if changed
        if position_changed || velocity_changed {
            self.last_sent_positions.insert(node_id.to_string(), new_position);
            self.last_sent_velocities.insert(node_id.to_string(), new_velocity);
            return true;
        }
        
        false
    }
    
    // New method to collect nodes that have changed position
    fn collect_changed_nodes(&mut self) -> Vec<(u16, BinaryNodeData)> {
        let mut changed_nodes = Vec::new();
        
        for (node_id, node_data) in self.node_position_cache.drain() {
            if let Ok(node_id_u16) = node_id.parse::<u16>() {
                changed_nodes.push((node_id_u16, node_data));
            }
        }
        
        changed_nodes
    }
}

impl Actor for SocketFlowServer {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        info!("[WebSocket] Client connected successfully");
        self.last_activity = std::time::Instant::now();
        
        // Set up server-side heartbeat ping to keep connection alive
        if !self.heartbeat_timer_set {
            ctx.run_interval(std::time::Duration::from_secs(5), |act, ctx| {
                // Send a heartbeat ping every 5 seconds
                debug!("[WebSocket] Sending server heartbeat ping");
                ctx.ping(b"");
                
                // Update last activity timestamp to prevent client-side timeout
                act.last_activity = std::time::Instant::now();
            });
        }

        // Send simple connection established message
        let response = serde_json::json!({
            "type": "connection_established",
            "timestamp": chrono::Utc::now().timestamp_millis()
        });

        if let Ok(msg_str) = serde_json::to_string(&response) {
            ctx.text(msg_str);
            self.last_activity = std::time::Instant::now();
        }

        // Send a "loading" message to indicate the client should display a loading indicator
        let loading_msg = serde_json::json!({
            "type": "loading",
            "message": "Calculating initial layout..."
        });
        ctx.text(serde_json::to_string(&loading_msg).unwrap_or_default());
        self.last_activity = std::time::Instant::now();
    }

    fn stopped(&mut self, _: &mut Self::Context) {
        info!("[WebSocket] Client disconnected");
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for SocketFlowServer {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                debug!("[WebSocket] Received ping");
                ctx.pong(&msg);
                self.last_activity = std::time::Instant::now();
            }
            Ok(ws::Message::Pong(_)) => {
                // Logging every pong creates too much noise, only log in detailed debug mode
                if self.settings.try_read().map(|s| s.system.debug.enable_websocket_debug).unwrap_or(false) {
                    debug!("[WebSocket] Received pong");
                }
                self.last_activity = std::time::Instant::now();
            }
            Ok(ws::Message::Text(text)) => {
                info!("Received text message: {}", text);
                self.last_activity = std::time::Instant::now();
                match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(msg) => {
                        match msg.get("type").and_then(|t| t.as_str()) {
                            Some("ping") => {
                                if let Ok(ping_msg) =
                                    serde_json::from_value::<PingMessage>(msg.clone())
                                {
                                    let pong = self.handle_ping(ping_msg);
                                    self.last_activity = std::time::Instant::now();
                                    if let Ok(response) = serde_json::to_string(&pong) {
                                        ctx.text(response);
                                    }
                                }
                            }
                            Some("requestInitialData") => {
                                info!("Received request for position updates");

                                // No need to check for initial_data_sent, just handle the request
                                let app_state = self.app_state.clone();
                                
                                ctx.run_interval(self.update_interval, move |act: &mut SocketFlowServer, ctx| {
                                    let app_state_clone = app_state.clone();
                                    let settings_clone = act.settings.clone();
                                    
                                    // First check if we should log this update (before spawning the future)
                                    let should_log = act.should_log_update();

                                    // Create the future without moving act
                                    let fut = async move {
                                        let raw_nodes = app_state_clone
                                            .graph_service
                                            .get_node_positions()
                                            .await;

                                        let node_count = raw_nodes.len();
                                        if node_count == 0 {
                                            debug!("[WebSocket] No nodes to send! Empty graph data."); return None;
                                        }

                                        // Check if detailed debugging should be enabled
                                        let detailed_debug = if let Ok(settings) = settings_clone.try_read() {
                                            settings.system.debug.enabled && 
                                            settings.system.debug.enable_websocket_debug
                                        } else {
                                            false
                                        };

                                        if detailed_debug {
                                            debug!("Raw nodes count: {}, showing first 5 nodes IDs:", raw_nodes.len());
                                            for (i, node) in raw_nodes.iter().take(5).enumerate() {
                                                debug!("  Node {}: id={} (numeric), metadata_id={} (filename)", 
                                                    i, node.id, node.metadata_id);
                                            }
                                        }

                                        let mut nodes = Vec::with_capacity(raw_nodes.len());
                                        for node in raw_nodes {
                                            // First try to parse as u16
                                            let node_id_result = match node.id.parse::<u16>() {
                                                Ok(id) => Ok(id),
                                                Err(_) => {
                                                    // If parsing as u16 fails, try parsing as u32 and check if it's within u16 range
                                                    match node.id.parse::<u32>() {
                                                        Ok(id) if id <= MAX_U16_VALUE => Ok(id as u16),
                                                        _ => Err(())
                                                    }
                                                }
                                            };
                                            if let Ok(node_id) = node_id_result {
                                                let node_data = BinaryNodeData {
                                                    position: node.data.position,
                                                    velocity: node.data.velocity,
                                                    mass: node.data.mass,
                                                    flags: node.data.flags,
                                                    padding: node.data.padding,
                                                };
                                                nodes.push((node_id, node_data));
                                            } else {
                                                // Log more detailed information about the node ID
                                                if let Ok(id) = node.id.parse::<u32>() {
                                                    warn!("[WebSocket] Node ID too large for u16: '{}' ({}), metadata_id: '{}'", 
                                                        node.id, id, node.metadata_id);
                                                } else {
                                                    warn!("[WebSocket] Failed to parse node ID as u16: '{}', metadata_id: '{}'", 
                                                        node.id, node.metadata_id);
                                                }
                                            }
                                        }

                                        // Only generate binary data if we have nodes to send
                                        // Only generate binary data if we have changed nodes to send
                                        if nodes.is_empty() {
                                            // Send a keepalive message every ~5 seconds if no nodes have changed
                                            // Just return an empty vector - activity timing is handled in the actor
                                            if false {
                                                return Some((Vec::new(), detailed_debug, Vec::new()));
                                            }
                                            return None;
                                        }
                                        
                                        // Filter nodes to only include those that have changed significantly
                                        // This reduces the amount of data we need to send
                                        let mut filtered_nodes = Vec::new();
                                        for (node_id, node_data) in nodes {
                                            // Store node data in a temporary map for the actor to process later
                                            let node_id_str = node_id.to_string();
                                            let position = node_data.position.clone();
                                            let velocity = node_data.velocity.clone();
                                            
                                            // Always include the node for now - filtering will be done in the actor
                                            filtered_nodes.push((node_id, node_data));
                                            
                                            if detailed_debug && filtered_nodes.len() <= 5 {
                                                debug!("Including node {} in update", node_id_str);
                                            }
                                        }
                                        
                                        // If no nodes have changed significantly, don't send an update
                                        if filtered_nodes.is_empty() {
                                            return None;
                                        }
                                       
                                        // Encode only the nodes that have changed significantly
                                        let data = binary_protocol::encode_node_data(&filtered_nodes);
                                        
                                        // Use filtered nodes for the rest of the processing
                                        nodes = filtered_nodes;
                                        
                                        // Return detailed debug info along with the data
                                        Some((data, detailed_debug, nodes))
                                    };
                                    
                                    // Convert future to actor future without ownership issues
                                    // This avoids the need to move 'act' into the future
                                    let fut = actix::fut::wrap_future::<_, Self>(fut);

                                    ctx.spawn(fut.map(move |result, act, ctx| {
                                        if let Some((binary_data, detailed_debug, nodes)) = result {
                                            // Log debug info if needed
                                            
                                            // Apply node filtering here using the actor's state
                                            let mut truly_filtered_nodes = Vec::new();
                                            for (node_id, node_data) in nodes {
                                                // Check if this node has changed enough to warrant an update
                                                if act.has_node_changed_significantly(
                                                    &node_id.to_string(), 
                                                    node_data.position.clone(),
                                                    node_data.velocity.clone()
                                                ) {
                                                    truly_filtered_nodes.push((node_id, node_data));
                                                }
                                            }
                                            
                                            // If no nodes have changed significantly, don't send an update
                                            if truly_filtered_nodes.is_empty() {
                                                return;
                                            }
                                            
                                            // Re-encode the truly filtered nodes
                                            let binary_data = binary_protocol::encode_node_data(&truly_filtered_nodes);
                                            if detailed_debug && should_log && !binary_data.is_empty() {
                                                debug!("[WebSocket] Encoded binary data: {} bytes for {} nodes", binary_data.len(), truly_filtered_nodes.len());
                                                
                                                // Log details about a sample node to track position changes
                                                if !truly_filtered_nodes.is_empty() {
                                                    let node = &truly_filtered_nodes[0];
                                                    debug!(
                                                        "Sample node: id={}, pos=[{:.2},{:.2},{:.2}], vel=[{:.2},{:.2},{:.2}]",
                                                        node.0, 
                                                        node.1.position.x, node.1.position.y, node.1.position.z,
                                                        node.1.velocity.x, node.1.velocity.y, node.1.velocity.z
                                                   );
                                                }
                                            }

                                            // Only send data if we have nodes to update
                                            if !truly_filtered_nodes.is_empty() {
                                                let final_data = act.maybe_compress(binary_data);
                                                
                                                // Update performance metrics
                                                act.last_transfer_size = final_data.len();
                                                act.total_bytes_sent += final_data.len();
                                                act.update_count += 1;
                                                act.nodes_sent_count += truly_filtered_nodes.len();
                                                let now = Instant::now();
                                                let elapsed = now.duration_since(act.last_transfer_time);
                                                act.last_transfer_time = now;
                                                
                                                // Log performance metrics periodically
                                                if detailed_debug && should_log {
                                                    let avg_bytes_per_update = if act.update_count > 0 {
                                                        act.total_bytes_sent / act.update_count
                                                    } else { 0 };
                                                    
                                                    debug!("[WebSocket] Transfer: {} bytes, {} nodes, {:?} since last, avg {} bytes/update",
                                                        final_data.len(), truly_filtered_nodes.len(), elapsed, avg_bytes_per_update);
                                                }
                                                
                                                ctx.binary(final_data);
                                            } else if detailed_debug && should_log {
                                                // Log keepalive
                                                debug!("[WebSocket] Sending keepalive (no position changes)");
                                            }
                                        }
                                    }));
                                });

                                let response = serde_json::json!({
                                    "type": "updatesStarted",
                                    "timestamp": chrono::Utc::now().timestamp_millis()
                                });
                                if let Ok(msg_str) = serde_json::to_string(&response) {
                                    self.last_activity = std::time::Instant::now();
                                    ctx.text(msg_str);
                                }
                            }
                            Some("enableRandomization") => {
                                if let Ok(enable_msg) = serde_json::from_value::<serde_json::Value>(msg.clone()) {
                                    let enabled = enable_msg.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false);
                                    info!("Client requested to {} node position randomization (server-side randomization removed)", 
                                         if enabled { "enable" } else { "disable" });
                                    
                                    // Server-side randomization has been removed, but we still acknowledge the client's request
                                    // to maintain backward compatibility with existing clients
                                    actix::spawn(async move {
                                        // Log that we received the request but server-side randomization is no longer supported
                                        info!("Node position randomization request acknowledged, but server-side randomization is no longer supported");
                                        info!("Client-side randomization is now used instead");
                                    });
                                }
                            }
                            _ => {
                                warn!("[WebSocket] Unknown message type: {:?}", msg);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("[WebSocket] Failed to parse text message: {}", e);
                        let error_msg = serde_json::json!({
                            "type": "error",
                            "message": format!("Failed to parse text message: {}", e)
                        });
                        if let Ok(msg_str) = serde_json::to_string(&error_msg) {
                            ctx.text(msg_str);
                        }
                    }
                }
            }
            Ok(ws::Message::Binary(data)) => {
                info!("Received binary message, length: {}", data.len());
                self.last_activity = std::time::Instant::now();
                
                // Enhanced logging for binary messages (26 bytes per node now)
                if data.len() % 26 != 0 {
                    warn!(
                        "Binary message size mismatch: {} bytes (not a multiple of 26, remainder: {})",
                        data.len(),
                        data.len() % 26
                    );
                }
                
                match binary_protocol::decode_node_data(&data) {
                    Ok(nodes) => {
                        if nodes.len() <= 2 {
                            let app_state = self.app_state.clone();
                            let nodes_vec: Vec<_> = nodes.into_iter().collect();

                            let fut = async move {
                                let mut graph = app_state.graph_service.get_graph_data_mut().await;
                                let mut node_map = app_state.graph_service.get_node_map_mut().await;

                                for (node_id, node_data) in nodes_vec {
                                    // Convert node_id to string for lookup
                                    let node_id_str = node_id.to_string();
                                    
                                    // Debug logging for node ID tracking
                                    if node_id < 5 {
                                        debug!(
                                            "Processing binary update for node ID: {} with position [{:.3}, {:.3}, {:.3}]",
                                            node_id, node_data.position.x, node_data.position.y, node_data.position.z
                                        );
                                    }
                                    
                                    if let Some(node) = node_map.get_mut(&node_id_str) {
                                        // Node exists with this numeric ID
                                        // Explicitly preserve existing mass and flags
                                        let original_mass = node.data.mass;
                                        let original_flags = node.data.flags;
                                        
                                        node.data.position = node_data.position;
                                        node.data.velocity = node_data.velocity;
                                        // Explicitly restore mass and flags after updating position/velocity
                                        node.data.mass = original_mass;
                                        node.data.flags = original_flags; // Restore flags needed for GPU code
                                    // Mass, flags, and padding are not overwritten as they're only 
                                    // present on the server side and not transmitted over the wire
                                    } else {
                                        debug!("Received update for unknown node ID: {}", node_id_str);
                                    }
                                }
                                
                                // Add more detailed debug information for mass maintenance
                                debug!("Updated node positions from binary data (preserving server-side properties)");

                                // Update graph nodes with new positions/velocities from the map, preserving other properties
                                for node in &mut graph.nodes {
                                    if let Some(updated_node) = node_map.get(&node.id) {
                                        // Explicitly preserve mass and flags before updating
                                        let original_mass = node.data.mass;
                                        let original_flags = node.data.flags;
                                        node.data.position = updated_node.data.position;
                                        node.data.velocity = updated_node.data.velocity;
                                        node.data.mass = original_mass; // Restore mass after updating
                                        node.data.flags = original_flags; // Restore flags after updating
                                    }
                                }
                            };

                            let fut = fut.into_actor(self);
                            ctx.spawn(fut.map(|_, _, _| ()));
                        } else {
                            warn!("Received update for too many nodes: {}", nodes.len());
                            let error_msg = serde_json::json!({
                                "type": "error",
                                "message": format!("Too many nodes in update: {}", nodes.len())
                            });
                            if let Ok(msg_str) = serde_json::to_string(&error_msg) {
                                ctx.text(msg_str);
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to decode binary message: {}", e);
                        let error_msg = serde_json::json!({
                            "type": "error",
                            "message": format!("Failed to decode binary message: {}", e)
                        });
                        if let Ok(msg_str) = serde_json::to_string(&error_msg) {
                            ctx.text(msg_str);
                        }
                    }
                }
            }
            Ok(ws::Message::Close(reason)) => {
                info!("[WebSocket] Client initiated close: {:?}", reason);
                ctx.close(reason); // Use client's reason for closing
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
                // Close with protocol error status code before stopping
                ctx.close(Some(ws::CloseReason::from(ws::CloseCode::Protocol)));
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
