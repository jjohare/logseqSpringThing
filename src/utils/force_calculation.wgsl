// Structure representing a node with position and velocity.
struct Node {
    position: vec3<f32>,
    velocity: vec3<f32>,
}

// Structure representing an edge between two nodes.
struct Edge {
    source: u32,
    target: u32,
    weight: f32,
}

// Parameters for the simulation.
struct SimulationParams {
    iterations: u32,
    repulsionStrength: f32,
    attractionStrength: f32,
    damping: f32,
}

// Uniform buffer containing simulation parameters.
@group(0) @binding(2) var<uniform> params: SimulationParams;

// Nodes buffer for reading and writing node data.
@group(0) @binding(0) var<storage, read_write> nodes: array<Node>;

// Edges buffer for reading edge data.
@group(0) @binding(1) var<storage, read> edges: array<Edge>;

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
    let i = global_id.x;
    if (i >= arrayLength(&nodes)) {
        return;
    }

    var node = nodes[i];
    var force = vec3<f32>(0.0);

    // Repulsion
    for (var j = 0; j < arrayLength(&nodes); j++) {
        if (i != j) {
            let other = nodes[j];
            let diff = node.position - other.position;
            let distSq = dot(diff, diff);
            if (distSq > 0.0) {
                force += normalize(diff) * params.repulsionStrength / distSq;
            }
        }
    }

    // Attraction
    for (var j = 0; j < arrayLength(&edges); j++) {
        let edge = edges[j];
        if (edge.source == i || edge.target == i) {
            let otherIndex = edge.source == i ? edge.target : edge.source;
            let other = nodes[otherIndex];
            let diff = other.position - node.position;
            let dist = length(diff);
            if (dist > 0.0) {
                force += normalize(diff) * params.attractionStrength * edge.weight * dist;
            }
        }
    }

    // Apply damping to velocity.
    node.velocity = (node.velocity + force) * params.damping;

    // Update node's position.
    node.position = node.position + node.velocity;

    // Ensure final position and velocity are valid
    if (!is_valid_float3(node.position)) {
        node.position = vec3<f32>(0.0, 0.0, 0.0);
    }
    if (!is_valid_float3(node.velocity)) {
        node.velocity = vec3<f32>(0.0, 0.0, 0.0);
    }

    // Write back to the buffer.
    nodes[i] = node;
}
