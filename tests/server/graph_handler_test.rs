use crate::handlers::graph_handler::{get_graph_data, refresh_graph};
use crate::models::graph::{GraphData, Node, Edge};
use crate::app_state::AppState;
use std::sync::{Arc, RwLock};

#[tokio::test]
async fn test_get_graph_data() {
    let app_state = AppState {
        graph_data: Arc::new(RwLock::new(GraphData {
            nodes: vec![Node { id: "1".to_string(), label: "Test Node".to_string(), metadata: Default::default() }],
            edges: vec![Edge { source: "1".to_string(), target: "2".to_string() }],
        })),
        file_cache: Arc::new(RwLock::new(Default::default())),
    };

    let result = get_graph_data(&app_state).await;
    assert!(result.is_ok());
    let graph_data = result.unwrap();
    assert_eq!(graph_data.nodes.len(), 1);
    assert_eq!(graph_data.edges.len(), 1);
}

#[tokio::test]
async fn test_refresh_graph() {
    let app_state = AppState {
        graph_data: Arc::new(RwLock::new(GraphData {
            nodes: vec![],
            edges: vec![],
        })),
        file_cache: Arc::new(RwLock::new(Default::default())),
    };

    let result = refresh_graph(&app_state).await;
    assert!(result.is_ok());
    let graph_data = result.unwrap();
   
    // Assuming some nodes and edges should be generated
    assert!(graph_data.nodes.len() > 0); // Ensure we have nodes
    assert!(graph_data.edges.len() > 0); // Ensure we have edges
}