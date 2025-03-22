use serde::{Deserialize, Serialize};
use bytemuck::{Pod, Zeroable};
use std::collections::HashMap;
use crate::types::vec3::Vec3Data;
use std::sync::atomic::{AtomicU32, Ordering};
use cudarc::driver::{DeviceRepr, ValidAsZeroBits};
use glam::Vec3;

// Static counter for generating unique numeric IDs
static NEXT_NODE_ID: AtomicU32 = AtomicU32::new(1);  // Start from 1 (0 could be reserved)

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable, Serialize, Deserialize)]
/// Binary node data structure for efficient transmission and GPU processing
/// 
/// Wire format (26 bytes per node):
/// - position: Vec3Data (12 bytes)
/// - velocity: Vec3Data (12 bytes)
/// - id: u16 (2 bytes)
///
/// Note: mass, flags, and padding are server-side only and not transmitted over the wire
/// to optimize bandwidth. They are still available for GPU processing and physics calculations.
pub struct BinaryNodeData {
    pub position: Vec3Data,
    pub velocity: Vec3Data,
    pub mass: u8,      // Server-side only, not transmitted
    pub flags: u8,     // Server-side only, not transmitted
    pub padding: [u8; 2], // Server-side only, not transmitted
}

// Implement DeviceRepr for BinaryNodeData
unsafe impl DeviceRepr for BinaryNodeData {}

// Implement ValidAsZeroBits for BinaryNodeData
unsafe impl ValidAsZeroBits for BinaryNodeData {}

#[derive(Debug, Serialize, Deserialize)]
pub struct PingMessage {
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(default = "default_timestamp")]
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PongMessage {
    #[serde(rename = "type")]
    pub type_: String,
    pub timestamp: u64,
}

fn default_timestamp() -> u64 {
    chrono::Utc::now().timestamp_millis() as u64
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    // Core data
    pub id: String,
    pub metadata_id: String,  // Store the original filename for lookup
    pub label: String,
    pub data: BinaryNodeData,

    // Metadata
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, String>,
    // We need to keep this attribute to maintain WebSocket protocol compatibility
    #[serde(skip)]
    pub file_size: u64,

    // Rendering properties
    #[serde(rename = "type")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_data: Option<HashMap<String, String>>,
}

impl Node {
    pub fn new(metadata_id: String) -> Self {
        // Generate a unique numeric ID for binary protocol compatibility
        let id = NEXT_NODE_ID.fetch_add(1, Ordering::SeqCst).to_string();
        
        Self {
            id,
            metadata_id: metadata_id.clone(),
            label: metadata_id,
            data: BinaryNodeData {
                position: Vec3Data::zero(),
                velocity: Vec3Data::zero(),
                mass: 0, // default mass, will be updated based on file size
                flags: 1, // Set to 1 by default (active state)
                padding: [0, 0],
            },
            metadata: HashMap::new(),
            // file_size is set to 0 initially, will be updated later with set_file_size
            file_size: 0,
            node_type: None,
            size: None,
            color: None,
            weight: None,
            group: None,
            user_data: None,
        }
    }

    pub fn calculate_mass(file_size: u64) -> u8 {
        // Use log scale to prevent extremely large masses
        // Add 1 to file_size to handle empty files (log(0) is undefined)
        // Scale down by 10000 to keep masses in a reasonable range
        let base_mass = ((file_size + 1) as f32).log10() / 4.0;
        // Ensure minimum mass of 0.1 and maximum of 10.0
        let mass = base_mass.max(0.1).min(10.0);
        (mass * 255.0 / 10.0) as u8
    }

    pub fn set_file_size(&mut self, size: u64) {
        self.file_size = size;
        // Update mass based on new file size
        self.data.mass = Self::calculate_mass(size);
        
        // Add the file_size to the metadata HashMap so it gets serialized to the client
        // This is our workaround since we can't directly serialize the file_size field
        if size > 0 {
            self.metadata.insert("fileSize".to_string(), size.to_string());
        }
    }

    // Convenience getters/setters for x, y, z coordinates
    pub fn x(&self) -> f32 { self.data.position.x }
    pub fn y(&self) -> f32 { self.data.position.y }
    pub fn z(&self) -> f32 { self.data.position.z }
    pub fn vx(&self) -> f32 { self.data.velocity.x }
    pub fn vy(&self) -> f32 { self.data.velocity.y }
    pub fn vz(&self) -> f32 { self.data.velocity.z }
    
    pub fn set_x(&mut self, val: f32) { self.data.position.x = val; }
    pub fn set_y(&mut self, val: f32) { self.data.position.y = val; }
    pub fn set_z(&mut self, val: f32) { self.data.position.z = val; }
    pub fn set_vx(&mut self, val: f32) { self.data.velocity.x = val; }
    pub fn set_vy(&mut self, val: f32) { self.data.velocity.y = val; }
    pub fn set_vz(&mut self, val: f32) { self.data.velocity.z = val; }
    
    /// Create a new node with a specific ID or use a stored ID if available
    pub fn new_with_id(metadata_id: String, stored_node_id: Option<String>) -> Self {
        // Use stored ID if available, otherwise generate a new one
        let id = match stored_node_id.clone() {
            Some(stored_id) if !stored_id.is_empty() && stored_id != "0" && stored_id.parse::<u32>().is_ok() => {
                // Use the provided ID only if it's a valid numeric ID
                debug!("Using provided ID {} for node {} in socket flow", stored_id, metadata_id);
                stored_id
            },
            None => NEXT_NODE_ID.fetch_add(1, Ordering::SeqCst).to_string(),
            _ => {
                let new_id = NEXT_NODE_ID.fetch_add(1, Ordering::SeqCst).to_string();
                debug!("Generated new ID {} for node {} in socket flow", new_id, metadata_id);
                new_id
            }
        };
        
        Self {
            id,
            metadata_id: metadata_id.clone(),
            label: metadata_id,
            data: BinaryNodeData {
                position: Vec3Data::zero(),
                velocity: Vec3Data::zero(),
                mass: 0, // default mass, will be updated based on file size
                flags: 1, // Set to 1 by default (active state)
                padding: [0, 0],
            },
            metadata: HashMap::new(),
            // file_size is set to 0 initially, will be updated later with set_file_size
            file_size: 0,
            node_type: None,
            size: None,
            color: None,
            weight: None,
            group: None,
            user_data: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Message {
    #[serde(rename = "ping")]
    Ping { timestamp: u64 },
    
    #[serde(rename = "pong")]
    Pong { timestamp: u64 },
    
    #[serde(rename = "enableRandomization")]
    EnableRandomization { enabled: bool },
}

// Helper functions to convert between Vec3Data and [f32; 3] for GPU computations
#[inline]
pub fn vec3data_to_array(vec: &Vec3Data) -> [f32; 3] {
    [vec.x, vec.y, vec.z]
}

#[inline]
pub fn array_to_vec3data(arr: [f32; 3]) -> Vec3Data {
    Vec3Data::new(arr[0], arr[1], arr[2])
}

#[inline]
pub fn vec3data_to_glam(vec: &Vec3Data) -> Vec3 {
    Vec3::new(vec.x, vec.y, vec.z)
}
