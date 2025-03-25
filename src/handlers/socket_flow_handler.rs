use actix::{prelude::*, Actor, Handler, Message};
use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use flate2::{write::ZlibEncoder, Compression};
use log::{debug, error, info, warn};
use std::io::Write;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
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
// Default values for deadbands if not provided in settings
const DEFAULT_POSITION_DEADBAND: f32 = 0.01; // 1cm deadband 
const DEFAULT_VELOCITY_DEADBAND: f32 = 0.005; // 5mm/s deadband
// Default values for dynamic update rate
const DEFAULT_MIN_UPDATE_RATE: u32 = 5;   // Min 5 updates per second when stable
const BATCH_UPDATE_WINDOW_MS: u64 = 200;  // Check motion every 200ms
const DEFAULT_MAX_UPDATE_RATE: u32 = 60;  // Max 60 updates per second when active
const DEFAULT_MOTION_THRESHOLD: f32 = 0.05;  // 5% of nodes need to be moving
const DEFAULT_MOTION_DAMPING: f32 = 0.9;  // Smooth transitions in rate

// Maximum value for u16 node IDs
const MAX_U16_VALUE: u32 = 65535;

/// ClientManager keeps track of all connected WebSocket clients
/// and provides methods for broadcasting data to all clients
#[derive(Debug)]
pub struct ClientManager {
    /// Map of client IDs to associated actor addresses
    clients: RwLock<HashMap<usize, actix::Addr<SocketFlowServer>>>,
    /// Counter for generating unique client IDs
    next_id: AtomicUsize,
}

impl ClientManager {
    /// Create a new ClientManager
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
            next_id: AtomicUsize::new(1),
        }
    }

    /// Register a new client with the manager
    pub async fn register(&self, addr: actix::Addr<SocketFlowServer>) -> usize {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let mut clients = self.clients.write().await;
        clients.insert(id, addr);
        info!("[ClientManager] Registered new client: {} (total: {})", id, clients.len());
        id
    }

    /// Unregister a client from the manager
    pub async fn unregister(&self, id: usize) {
        let mut clients = self.clients.write().await;
        clients.remove(&id);
        info!("[ClientManager] Unregistered client: {} (remaining: {})", id, clients.len());
    }

    /// Broadcast node positions to all connected clients
    pub async fn broadcast_node_positions(&self, nodes: Vec<crate::utils::socket_flow_messages::Node>) {
        if nodes.is_empty() {
            return;
        }

        let clients = self.clients.read().await;
        if clients.is_empty() {
            return;
        }

        // Convert nodes to binary format
        let binary_data = nodes.into_iter()
            .filter_map(|node| {
                // Parse node ID as u16 for binary protocol
                node.id.parse::<u16>().ok().map(|id| (id, BinaryNodeData {
                    position: node.data.position,
                    velocity: node.data.velocity,
                    mass: node.data.mass,
                    flags: node.data.flags,
                    padding: node.data.padding,
                }))
            })
            .collect::<Vec<_>>();

        // Send the update to all clients
        for (id, addr) in clients.iter() {
            addr.do_send(BroadcastPositionUpdate(binary_data.clone()));
            debug!("[ClientManager] Sent position update to client {}", id);
        }
    }
}

// Message to set client ID after registration
#[derive(Message)]
#[rtype(result = "()")]
struct SetClientId(usize);

// Implement handler for SetClientId message
impl Handler<SetClientId> for SocketFlowServer {
    type Result = ();

    fn handle(&mut self, msg: SetClientId, _ctx: &mut Self::Context) -> Self::Result {
        self.client_id = Some(msg.0);
        info!("[WebSocket] Client assigned ID: {}", msg.0);
    }
}

// Implement handler for BroadcastPositionUpdate message
impl Handler<BroadcastPositionUpdate> for SocketFlowServer {
    type Result = ();

    fn handle(&mut self, msg: BroadcastPositionUpdate, ctx: &mut Self::Context) -> Self::Result {
        if !msg.0.is_empty() {
            // Encode the binary message
            let binary_data = binary_protocol::encode_node_data(&msg.0);
            
            // Apply compression if needed
            let compressed_data = self.maybe_compress(binary_data);
            
            // Send to client
            ctx.binary(compressed_data);
            
            // Debug logging - limit to avoid spamming logs
            if self.should_log_update() {
                debug!("[WebSocket] Position update sent: {} nodes", msg.0.len());
            }
        }
    }
}
/// Message type for broadcasting position updates to clients
#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct BroadcastPositionUpdate(pub Vec<(u16, BinaryNodeData)>);

pub struct SocketFlowServer {
    app_state: Arc<AppState>,
    settings: Arc<RwLock<crate::config::Settings>>,
    client_id: Option<usize>,
    client_manager: Option<Arc<ClientManager>>,
    last_ping: Option<u64>,
    update_counter: usize, // Counter for throttling debug logs
    last_activity: std::time::Instant, // Track last activity time
    heartbeat_timer_set: bool, // Flag to track if heartbeat timer is set
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
    nodes_sent_count: usize,
    
    // Dynamic update rate fields
    last_batch_time: Instant, // Last time we sent a batch of updates
    current_update_rate: u32,  // Current rate in updates per second
    min_update_rate: u32,      // Minimum rate from settings
    max_update_rate: u32,      // Maximum rate from settings
    motion_threshold: f32,     // % of nodes that need to be moving to consider "in motion"
    motion_damping: f32,       // Smoothing factor for rate changes
    nodes_in_motion: usize,    // Counter for nodes currently in motion
    total_node_count: usize,   // Total node count for percentage calculation
    last_motion_check: Instant, // Last time we checked motion percentage,
}

impl SocketFlowServer {
    pub fn new(app_state: Arc<AppState>, settings: Arc<RwLock<crate::config::Settings>>, client_manager: Option<Arc<ClientManager>>) -> Self {
        // Get dynamic rate settings from config
        let min_update_rate = settings
            .try_read()
            .map(|s| s.system.websocket.min_update_rate)
            .unwrap_or(DEFAULT_MIN_UPDATE_RATE);

        let max_update_rate = settings
            .try_read()
            .map(|s| s.system.websocket.max_update_rate)
            .unwrap_or(DEFAULT_MAX_UPDATE_RATE);

        let motion_threshold = settings
            .try_read()
            .map(|s| s.system.websocket.motion_threshold)
            .unwrap_or(DEFAULT_MOTION_THRESHOLD);

        let motion_damping = settings
            .try_read()
            .map(|s| s.system.websocket.motion_damping)
            .unwrap_or(DEFAULT_MOTION_DAMPING);

        // Use position and velocity deadbands from constants
        let position_deadband = DEFAULT_POSITION_DEADBAND;
        let velocity_deadband = DEFAULT_VELOCITY_DEADBAND;

        // Start at max update rate and adjust dynamically based on motion
        let current_update_rate = max_update_rate;

        Self {
            app_state,
            settings,
            client_id: None,
            client_manager,
            last_ping: None,
            update_counter: 0,
            last_activity: std::time::Instant::now(),
            heartbeat_timer_set: false,
            node_position_cache: HashMap::new(),
            last_sent_positions: HashMap::new(),
            last_sent_velocities: HashMap::new(),
            position_deadband,
            velocity_deadband,
            last_transfer_size: 0,
            last_transfer_time: Instant::now(),
            total_bytes_sent: 0,
            last_batch_time: Instant::now(),
            update_count: 0,
            nodes_sent_count: 0,
            current_update_rate,
            min_update_rate,
            max_update_rate,
            motion_threshold,
            motion_damping,
            nodes_in_motion: 0,
            total_node_count: 0,
            last_motion_check: Instant::now()
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
        // Check if compression is enabled in settings
        let compression_enabled = self.settings
            .try_read()
            .map(|s| s.system.websocket.compression_enabled)
            .unwrap_or(false);
        
        // If compression is disabled, return the original data
        if !compression_enabled {
            if self.should_log_update() {
                debug!("Compression disabled in settings, skipping compression for {} bytes", data.len());
            }
            return data;
        }
        
        // Get compression threshold from settings
        let threshold = self.settings
            .try_read()
            .map(|s| s.system.websocket.compression_threshold)
            .unwrap_or(512);
        
        // Only compress if data is larger than the threshold
        if data.len() > threshold as usize {
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
        
        // If compression failed or wasn't beneficial, return the original data
        if self.should_log_update() && data.len() > threshold as usize {
            debug!("Skipping compression for {} bytes (not beneficial)", data.len());
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

    // Calculate the current update interval based on the dynamic rate
    fn get_current_update_interval(&self) -> std::time::Duration {
        let millis = (1000.0 / self.current_update_rate as f64) as u64;
        std::time::Duration::from_millis(millis)
    }
    
    // Calculate the percentage of nodes in motion
    fn calculate_motion_percentage(&self) -> f32 {
        if self.total_node_count == 0 {
            return 0.0;
        }
        
        (self.nodes_in_motion as f32) / (self.total_node_count as f32)
    }
    
    // Update the dynamic rate based on current motion
    fn update_dynamic_rate(&mut self) {
        // Only recalculate periodically to avoid rapid changes
        let now = Instant::now();
        let batch_window = std::time::Duration::from_millis(BATCH_UPDATE_WINDOW_MS);
        let elapsed = now.duration_since(self.last_batch_time);
        
        // If we've waited at least the batch window time, or this is the first update
        if elapsed >= batch_window {
            // Calculate the current motion percentage
            let motion_pct = self.calculate_motion_percentage();
            
            // Adjust the update rate based on the motion percentage
            if motion_pct > self.motion_threshold {
                // Gradually increase rate for high motion scenarios
                self.current_update_rate = ((self.current_update_rate as f32) * self.motion_damping + 
                                           (self.max_update_rate as f32) * (1.0 - self.motion_damping)) as u32;
            } else {
                // Gradually decrease rate for low motion scenarios
                self.current_update_rate = ((self.current_update_rate as f32) * self.motion_damping + 
                                           (self.min_update_rate as f32) * (1.0 - self.motion_damping)) as u32;
            }
            
            // Ensure rate stays within min and max bounds
            self.current_update_rate = self.current_update_rate.clamp(self.min_update_rate, self.max_update_rate);
            
            // Update the last motion check time
            self.last_motion_check = now;
        }
    }

    // New method to mark a batch as sent
    fn mark_batch_sent(&mut self) { self.last_batch_time = Instant::now(); }
    
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
        // Register this client with the client manager
        if let Some(client_manager) = &self.client_manager {
            let addr = ctx.address();
            let addr_clone = addr.clone();
            
            // Use actix's runtime to avoid blocking in the actor's started method
            let cm_clone = client_manager.clone();
            actix::spawn(async move {
                let client_id = cm_clone.register(addr_clone).await;
                // Send a message back to the actor with its client ID
                addr.do_send(SetClientId(client_id));
            });
        }
    
        info!("[WebSocket] New client connected");
        self.last_activity = std::time::Instant::now();
        
        // We'll retrieve client ID asynchronously via message
        self.client_id = None;

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

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        // Unregister this client when it disconnects
        if let Some(client_id) = self.client_id {
            if let Some(client_manager) = &self.client_manager {
                let client_manager_clone = client_manager.clone();
                actix::spawn(async move {
                    client_manager_clone.unregister(client_id).await;
                });
            }
            info!("[WebSocket] Client {} disconnected", client_id);
        }
    }
}

// Helper function to fetch nodes without borrowing from the actor

async fn fetch_nodes(
    app_state: Arc<AppState>,
    settings: Arc<RwLock<crate::config::Settings>>
) -> Option<(Vec<(u16, BinaryNodeData)>, bool)> {
    // Fetch raw nodes asynchronously
    let raw_nodes = app_state.graph_service.get_node_positions().await;
    
    if raw_nodes.is_empty() {
        debug!("[WebSocket] No nodes to send! Empty graph data.");
        return None;
    }

    // Check if detailed debugging should be enabled
    let detailed_debug = if let Ok(settings) = settings.try_read() {
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
    
    if nodes.is_empty() {
        return None;
    }
    
    // Return nodes and debug flag
    Some((nodes, detailed_debug))
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
                                info!("Client requested initial data - sending authoritative server state");

                                // Use a smaller initial interval to start updates quickly
                                let initial_interval = std::time::Duration::from_millis(10);
                                let app_state = self.app_state.clone();
                                let settings_clone = self.settings.clone();
                                
                                // First check if we should log this update
                                let should_log = self.should_log_update();
                                
                                ctx.run_later(initial_interval, move |_act, ctx| {
                                    // Wrap the async function in an actor future
                                    let fut = fetch_nodes(app_state.clone(), settings_clone.clone());
                                    let fut = actix::fut::wrap_future::<_, Self>(fut);
                                    
                                    ctx.spawn(fut.map(move |result, act, ctx| {
                                        if let Some((nodes, detailed_debug)) = result {
                                            // Now that we're back in the actor context, we can filter the nodes
                                            // Filter nodes to only include those that have changed significantly
                                            let mut filtered_nodes = Vec::new();
                                            for (node_id, node_data) in &nodes {
                                                let node_id_str = node_id.to_string();
                                                let position = node_data.position.clone();
                                                let velocity = node_data.velocity.clone();
                                                
                                                // Apply filtering before adding to filtered nodes
                                                if act.has_node_changed_significantly(
                                                    &node_id_str,
                                                    position.clone(),
                                                    velocity.clone()
                                                ) {
                                                    filtered_nodes.push((*node_id, node_data.clone()));
                                                }
                                                
                                                if detailed_debug && filtered_nodes.len() <= 5 {
                                                    debug!("Including node {} in update", node_id_str);
                                                }
                                            }
                                            
                                            // If no nodes have changed significantly, don't send an update
                                            if filtered_nodes.is_empty() {
                                                return;
                                            }
                                            
                                            // Encode only the nodes that have changed significantly
                                            let binary_data = binary_protocol::encode_node_data(&filtered_nodes);
                                            
                                            // Update motion metrics for dynamic rate adjustment
                                            act.total_node_count = filtered_nodes.len();
                                              
                                            // Count nodes in motion (with non-zero velocity)
                                            let moving_nodes = filtered_nodes.iter()
                                                .filter(|(_, node_data)| {
                                                    let vel = &node_data.velocity;
                                                    vel.x.abs() > 0.001 || vel.y.abs() > 0.001 || vel.z.abs() > 0.001
                                                })
                                                .count();
                                            
                                            act.nodes_in_motion = moving_nodes;
                                            
                                            // Update the dynamic rate based on current motion
                                            act.update_dynamic_rate();
                                            
                                            // Get the current update interval for the next update
                                            let update_interval = act.get_current_update_interval();
                                            
                                            if detailed_debug && should_log {
                                                debug!("[WebSocket] Motion: {}/{} nodes, Rate: {} updates/sec, Interval: {:?}",
                                                    moving_nodes, filtered_nodes.len(), act.current_update_rate, update_interval);
                                            }
                                            
                                            if detailed_debug && should_log && !binary_data.is_empty() {
                                                debug!("[WebSocket] Encoded binary data: {} bytes for {} nodes", binary_data.len(), filtered_nodes.len());
                                                
                                                // Log details about a sample node to track position changes
                                                if !filtered_nodes.is_empty() {
                                                    let node = &filtered_nodes[0];
                                                    debug!(
                                                        "Sample node: id={}, pos=[{:.2},{:.2},{:.2}], vel=[{:.2},{:.2},{:.2}]",
                                                        node.0, 
                                                        node.1.position.x, node.1.position.y, node.1.position.z,
                                                        node.1.velocity.x, node.1.velocity.y, node.1.velocity.z
                                                    );
                                                }
                                            }

                                            // Only send data if we have nodes to update
                                            if !filtered_nodes.is_empty() {
                                                let final_data = act.maybe_compress(binary_data);
                                                
                                                // Update performance metrics
                                                act.last_transfer_size = final_data.len();
                                                act.total_bytes_sent += final_data.len();
                                                act.update_count += 1;
                                                act.nodes_sent_count += filtered_nodes.len();
                                                let now = Instant::now();
                                                let elapsed = now.duration_since(act.last_transfer_time);
                                                act.last_transfer_time = now;
                                                
                                                // Schedule the next update using the dynamic rate
                                                let next_interval = act.get_current_update_interval();
                                                
                                                // Use a simple recursive approach to restart the cycle
                                                let _app_state = act.app_state.clone();
                    let _settings_clone = act.settings.clone();
                                                ctx.run_later(next_interval, move |act, ctx| {
                                                    // Recursively call the handler to restart the cycle
                                                    <SocketFlowServer as StreamHandler<Result<ws::Message, ws::ProtocolError>>>::handle(act, Ok(ws::Message::Text("{\"type\":\"requestPositionUpdates\"}".to_string().into())), ctx);
                                                });
                                                
                                                // Log performance metrics periodically
                                                if detailed_debug && should_log {
                                                    let avg_bytes_per_update = if act.update_count > 0 {
                                                        act.total_bytes_sent / act.update_count
                                                    } else { 0 };
                                                    
                                                    debug!("[WebSocket] Transfer: {} bytes, {} nodes, {:?} since last, avg {} bytes/update",
                                                        final_data.len(), filtered_nodes.len(), elapsed, avg_bytes_per_update);
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
                // Enhanced logging for binary message reception
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
                        info!("Decoded {} nodes from binary message", nodes.len());
                        let _nodes_vec: Vec<_> = nodes.clone().into_iter().collect();

                        // CRITICAL FIX: Remove node count limitation to allow processing batches from randomization
                        // Previous code only allowed 2 nodes maximum, which blocked randomization batches
                        {
                            let app_state = self.app_state.clone();
                            let nodes_vec: Vec<_> = nodes.clone().into_iter().collect();

                            let fut = async move {
                                for (node_id, node_data) in &nodes_vec {
                                    // Convert node_id to string for lookup
                                    let _node_id_str = node_id.to_string();
                                    
                                    // Debug logging for node ID tracking
                                    if *node_id < 5 {
                                        debug!(
                                            "Processing binary update for node ID: {} with position [{:.3}, {:.3}, {:.3}]",
                                            node_id, node_data.position.x, node_data.position.y, node_data.position.z
                                        );
                                    }
                                }

                                let mut graph = app_state.graph_service.get_graph_data_mut().await;
                                let mut node_map = app_state.graph_service.get_node_map_mut().await;

                                for (node_id, node_data) in nodes_vec {
                                    let node_id_str = node_id.to_string();
                                    
                                    if let Some(node) = node_map.get_mut(&node_id_str) {
                                        // Node exists with this numeric ID
                                        // Explicitly preserve existing mass and flags
                                        let original_mass = node.data.mass;
                                        let original_flags = node.data.flags;
                                        
                                        node.data.position = node_data.position;
                                        node.data.velocity = node_data.velocity;
                                        // Explicitly restore mass and flags after updating position/velocity
                                        debug!("Updated position for node ID {} to [{:.3}, {:.3}, {:.3}]", 
                                             node_id_str, node_data.position.x, node_data.position.y, node_data.position.z);
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

                                // Trigger force calculation after updating node positions
                                info!("Preparing to recalculate layout after client-side node position update");
                                
                                // Get the GPU compute from GraphService
                                let gpu_compute = app_state.graph_service.get_gpu_compute().await;
                                
                                if let Some(gpu_compute) = &gpu_compute {
                                    // Read settings outside the GraphService lock to avoid deadlocks
                                    let settings = app_state.settings.read().await;
                                    let physics_settings = settings.visualization.physics.clone();
                                    drop(settings); // Release the read lock
                                    
                                    let params = crate::models::simulation_params::SimulationParams {
                                        iterations: physics_settings.iterations,
                                        spring_strength: physics_settings.spring_strength,
                                        repulsion: physics_settings.repulsion_strength,
                                        damping: physics_settings.damping,
                                        max_repulsion_distance: physics_settings.repulsion_distance,
                                        viewport_bounds: physics_settings.bounds_size,
                                        mass_scale: physics_settings.mass_scale,
                                        boundary_damping: physics_settings.boundary_damping,
                                        enable_bounds: physics_settings.enable_bounds,
                                        time_step: 0.016, // Fixed time step
                                        phase: crate::models::simulation_params::SimulationPhase::Dynamic,
                                        mode: crate::models::simulation_params::SimulationMode::Remote,
                                    };
                                    info!("Recalculating layout with params: spring_strength={:.3}, repulsion={:.3}, damping={:.3}", 
                                        params.spring_strength, params.repulsion, params.damping);
                                    
                                    if let Err(e) = crate::services::graph_service::GraphService::calculate_layout(gpu_compute, &mut graph, &mut node_map, &params).await {
                                        error!("Error calculating layout after node position update: {}", e);
                                    }
                                    else { 
                                        info!("Successfully recalculated layout after node position update");
                                    }
                                }
                                else {
                                    warn!("GPU compute not available, cannot recalculate layout after node position update");
                                }
                            };

                            let fut = fut.into_actor(self);
                            ctx.spawn(fut.map(|_, _, _| ()));
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
    settings: web::Data<Arc<RwLock<crate::config::Settings>>>
) -> Result<HttpResponse, Error> {
    // Ensure ClientManager exists in app_state or create it if not present
    let client_manager = app_state.ensure_client_manager().await;

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

    let ws = SocketFlowServer::new(app_state.into_inner(), settings.get_ref().clone(), Some(client_manager));

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
