// update_positions.wgsl

// Structure representing a node with position and velocity.
struct Node {
    position: vec2<f32>,
    velocity: vec2<f32>,
}

// Buffer containing all nodes.
[[block]]
struct NodesBuffer {
    nodes: array<Node>;
}

// Uniform buffer containing delta time for the simulation.
[[group(0), binding(1)]]
var<uniform> delta_time: f32;

// Nodes buffer for reading and writing node data.
[[group(0), binding(0)]]
var<storage, read_write> nodes_buffer: NodesBuffer;

// Main compute shader function.
[[stage(compute), workgroup_size(64)]]
fn main([[builtin(global_invocation_id)]] global_id: vec3<u32>) {
    let node_id = global_id.x;
    let n_nodes = arrayLength(&nodes_buffer.nodes);

    if (node_id < n_nodes) {
        var node = nodes_buffer.nodes[node_id];

        // Update node's position based on its velocity.
        node.position = node.position + node.velocity * delta_time;

        // Write back to the buffer.
        nodes_buffer.nodes[node_id] = node;
    }
}