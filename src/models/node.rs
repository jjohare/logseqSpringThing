use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::utils::socket_flow_messages::BinaryNodeData;

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
                position: [0.0, 0.0, 0.0],
                velocity: [0.0, 0.0, 0.0],
                mass: 0,
                flags: 1, // Active by default
                padding: [0, 0],
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

    pub fn set_file_size(&mut self, size: u64) {
        self.file_size = size;
        // Calculate mass using log scale to prevent extremely large masses
        let base_mass = ((size + 1) as f32).log10() / 4.0;
        // Scale to 0-255 range for u8
        self.data.mass = ((base_mass.max(0.1).min(10.0) * 25.5) as u8).max(1);
    }

    pub fn with_position(mut self, x: f32, y: f32, z: f32) -> Self {
        self.data.position = [x, y, z];
        self
    }

    pub fn with_velocity(mut self, vx: f32, vy: f32, vz: f32) -> Self {
        self.data.velocity = [vx, vy, vz];
        self
    }

    pub fn with_label(mut self, label: String) -> Self {
        self.label = label;
        self
    }

    pub fn with_metadata(mut self, key: String, value: String) -> Self {
        self.metadata.insert(key, value);
        self
    }

    pub fn with_type(mut self, node_type: String) -> Self {
        self.node_type = Some(node_type);
        self
    }

    pub fn with_size(mut self, size: f32) -> Self {
        self.size = Some(size);
        self
    }

    pub fn with_color(mut self, color: String) -> Self {
        self.color = Some(color);
        self
    }

    pub fn with_weight(mut self, weight: f32) -> Self {
        self.weight = Some(weight);
        self
    }

    pub fn with_group(mut self, group: String) -> Self {
        self.group = Some(group);
        self
    }

    // Convenience getters/setters for position and velocity
    pub fn x(&self) -> f32 { self.data.position[0] }
    pub fn y(&self) -> f32 { self.data.position[1] }
    pub fn z(&self) -> f32 { self.data.position[2] }
    pub fn vx(&self) -> f32 { self.data.velocity[0] }
    pub fn vy(&self) -> f32 { self.data.velocity[1] }
    pub fn vz(&self) -> f32 { self.data.velocity[2] }
    
    pub fn set_x(&mut self, val: f32) { self.data.position[0] = val; }
    pub fn set_y(&mut self, val: f32) { self.data.position[1] = val; }
    pub fn set_z(&mut self, val: f32) { self.data.position[2] = val; }
    pub fn set_vx(&mut self, val: f32) { self.data.velocity[0] = val; }
    pub fn set_vy(&mut self, val: f32) { self.data.velocity[1] = val; }
    pub fn set_vz(&mut self, val: f32) { self.data.velocity[2] = val; }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_creation() {
        let node = Node::new("test".to_string())
            .with_position(1.0, 2.0, 3.0)
            .with_velocity(0.1, 0.2, 0.3)
            .with_label("Test Node".to_string())
            .with_type("test_type".to_string())
            .with_size(1.5)
            .with_color("#FF0000".to_string())
            .with_weight(2.0)
            .with_group("group1".to_string());

        assert_eq!(node.id, "test");
        assert_eq!(node.label, "Test Node");
        assert_eq!(node.data.position, [1.0, 2.0, 3.0]);
        assert_eq!(node.data.velocity, [0.1, 0.2, 0.3]);
        assert_eq!(node.node_type, Some("test_type".to_string()));
        assert_eq!(node.size, Some(1.5));
        assert_eq!(node.color, Some("#FF0000".to_string()));
        assert_eq!(node.weight, Some(2.0));
        assert_eq!(node.group, Some("group1".to_string()));
    }

    #[test]
    fn test_position_velocity_getters_setters() {
        let mut node = Node::new("test".to_string());
        
        node.set_x(1.0);
        node.set_y(2.0);
        node.set_z(3.0);
        node.set_vx(0.1);
        node.set_vy(0.2);
        node.set_vz(0.3);

        assert_eq!(node.x(), 1.0);
        assert_eq!(node.y(), 2.0);
        assert_eq!(node.z(), 3.0);
        assert_eq!(node.vx(), 0.1);
        assert_eq!(node.vy(), 0.2);
        assert_eq!(node.vz(), 0.3);
    }

    #[test]
    fn test_mass_calculation() {
        let mut node = Node::new("test".to_string());
        
        // Test small file
        node.set_file_size(100);  // 100 bytes
        assert!(node.data.mass > 0 && node.data.mass < 128);

        // Test large file
        node.set_file_size(1_000_000);  // 1MB
        assert!(node.data.mass > 128 && node.data.mass < 255);
    }
}
