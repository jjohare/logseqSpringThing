use serde::{Deserialize, Serialize};
use bytemuck::{Pod, Zeroable};
use std::collections::HashMap;
use cudarc::driver::{DeviceRepr, ValidAsZeroBits};
use crate::types::vec3::Vec3Data;

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable, Serialize, Deserialize)]
pub struct BinaryNodeData {
    pub position: Vec3Data,  // x, y, z
    pub velocity: Vec3Data,  // vx, vy, vz
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
    pub label: String,
    pub data: BinaryNodeData,

    // Metadata
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub metadata: HashMap<String, String>,
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
    pub fn new(id: String) -> Self {
        Self {
            id: id.clone(),
            label: id,
            data: BinaryNodeData {
                position: Vec3Data::zero(),
                velocity: Vec3Data::zero(),
            },
            metadata: HashMap::new(),
            file_size: 0,
            node_type: None,
            size: None,
            color: None,
            weight: None,
            group: None,
            user_data: None,
        }
    }

    pub fn update_from_binary_data(&mut self, binary_data: &BinaryNodeData) {
        self.data = *binary_data;
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
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Message {
    #[serde(rename = "ping")]
    Ping { timestamp: u64 },
    
    #[serde(rename = "pong")]
    Pong { timestamp: u64 },
}
