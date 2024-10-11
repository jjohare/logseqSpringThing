// Structure representing a node with position and velocity.
struct Node {
    position: vec3<f32>,
    velocity: vec3<f32>,
}

// Structure representing an edge between two nodes.
struct Edge {
    source: u32,
    target_node: u32,
    weight: f32,
}

// Buffer containing all nodes.
struct NodesBuffer {
    nodes: array<Node>,
}

// Buffer containing all edges.
struct EdgesBuffer {
    edges: array<Edge>,
}

// Parameters for the simulation.
struct SimulationParams {
    repulsion_strength: f32,
    attraction_strength: f32,
    damping: f32,
    delta_time: f32,
}

// Uniform buffer containing simulation parameters.
@group(0) @binding(2) var<uniform> simulation_params: SimulationParams;

// Nodes buffer for reading and writing node data.
@group(0) @binding(0) var<storage, read_write> nodes_buffer: NodesBuffer;

// Edges buffer for reading edge data.
@group(0) @binding(1) var<storage, read> edges_buffer: EdgesBuffer;

fn is_nan(x: f32) -> bool {
    return x != x;
}

fn is_inf(x: f32) -> bool {
    return abs(x) == 1.0 / 0.0;
}

fn is_valid_float3(v: vec3<f32>) -> bool {
    return !(is_nan(v.x) || is_nan(v.y) || is_nan(v.z) || is_inf(v.x) || is_inf(v.y) || is_inf(v.z));
}

// Main compute shader function.
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let node_id = global_id.x;
    let n_nodes = arrayLength(&nodes_buffer.nodes);

    if (node_id < n_nodes) {
        var node = nodes_buffer.nodes[node_id];
        var force = vec3<f32>(0.0, 0.0, 0.0);

        if (!is_valid_float3(node.position)) {
            node.position = vec3<f32>(0.0, 0.0, 0.0);
        }

        // Repulsive force between nodes.
        for (var i = 0u; i < n_nodes; i = i + 1u) {
            if (i != node_id) {
                let other_node = nodes_buffer.nodes[i];
                let direction = node.position - other_node.position;
                let distance_sq = dot(direction, direction);
                
                // Check for zero distance to avoid division by zero
                if (distance_sq > 0.0001) {
                    let repulsive_force = simulation_params.repulsion_strength / distance_sq;
                    force = force + normalize(direction) * repulsive_force;
                }
            }
        }

        // Attractive force along edges.
        let n_edges = arrayLength(&edges_buffer.edges);
        for (var j = 0u; j < n_edges; j = j + 1u) {
            let edge = edges_buffer.edges[j];
            if (edge.source == node_id || edge.target_node == node_id) {
                let other_id = select(edge.source, edge.target_node, edge.source == node_id);
                let other_node = nodes_buffer.nodes[other_id];
                let direction = other_node.position - node.position;
                let distance = length(direction);
                if (distance > 0.0001) {
                    let attractive_force = simulation_params.attraction_strength * edge.weight * distance;
                    force = force + normalize(direction) * attractive_force;
                }
            }
        }

        // Apply damping to velocity.
        node.velocity = (node.velocity + force * simulation_params.delta_time) * simulation_params.damping;

        // Update node's position.
        node.position = node.position + node.velocity * simulation_params.delta_time;

        // Ensure final position and velocity are valid
        if (!is_valid_float3(node.position)) {
            node.position = vec3<f32>(0.0, 0.0, 0.0);
        }
        if (!is_valid_float3(node.velocity)) {
            node.velocity = vec3<f32>(0.0, 0.0, 0.0);
        }

        // Write back to the buffer.
        nodes_buffer.nodes[node_id] = node;
    }
}
