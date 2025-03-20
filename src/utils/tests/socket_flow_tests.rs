use crate::utils::socket_flow_messages::{Node, BinaryNodeData};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_serialization() {
        // Create test node data
        let node_data = BinaryNodeData {
            position: [1.0, 2.0, 3.0],
            velocity: [0.1, 0.2, 0.3],
        };

        let node = Node {
            id: "test_node".to_string(),
            label: "Test Node".to_string(),
            data: node_data,
            metadata: Default::default(),
            file_size: 0,
            node_type: None,
            size: None,
            color: None,
            weight: None,
            group: None,
            user_data: None,
        };

        // Test serialization
        let serialized = serde_json::to_string(&node).unwrap();
        let deserialized: Node = serde_json::from_str(&serialized).unwrap();

        assert_eq!(node.id, deserialized.id);
        assert_eq!(node.data.position, deserialized.data.position);
        assert_eq!(node.data.velocity, deserialized.data.velocity);
    }

    #[test]
    fn test_binary_node_data() {
        // Create test nodes
        let node1_data = BinaryNodeData {
            position: [1.0, 2.0, 3.0],
            velocity: [0.1, 0.2, 0.3],
        };

        let node2_data = BinaryNodeData {
            position: [4.0, 5.0, 6.0],
            velocity: [0.4, 0.5, 0.6],
        };

        let nodes = vec![
            Node {
                id: "1".to_string(),
                label: "Node 1".to_string(),
                data: node1_data,
                metadata: Default::default(),
                file_size: 0,
                node_type: None,
                size: None,
                color: None,
                weight: None,
                group: None,
                user_data: None,
            },
            Node {
                id: "2".to_string(),
                label: "Node 2".to_string(),
                data: node2_data,
                metadata: Default::default(),
                file_size: 0,
                node_type: None,
                size: None,
                color: None,
                weight: None,
                group: None,
                user_data: None,
            },
        ];

        // Test binary conversion
        let binary_nodes: Vec<(u32, BinaryNodeData)> = nodes.iter()
            .map(|node| (
                node.id.parse::<u32>().unwrap(),
                node.data
            ))
            .collect();

        assert_eq!(binary_nodes.len(), 2);
        assert_eq!(binary_nodes[0].0, 1);
        assert_eq!(binary_nodes[0].1.position, [1.0, 2.0, 3.0]);
        assert_eq!(binary_nodes[0].1.velocity, [0.1, 0.2, 0.3]);
        assert_eq!(binary_nodes[1].0, 2);
        assert_eq!(binary_nodes[1].1.position, [4.0, 5.0, 6.0]);
        assert_eq!(binary_nodes[1].1.velocity, [0.4, 0.5, 0.6]);
    }
}
