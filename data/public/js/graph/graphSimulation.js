// graphSimulation.js - Handles client-side force-directed graph calculations

export class GraphSimulation {
    constructor(nodes = [], edges = [], params = {}) {
        this.nodes = nodes;
        this.edges = edges;
        this.params = {
            iterations: params.iterations || 100,
            repulsion: params.repulsion || 1.0,
            attraction: params.attraction || 0.01,
            damping: params.damping || 0.85,
            centeringForce: params.centeringForce || 0.05,
            maxSpeed: params.maxSpeed || 10,
            minDistance: params.minDistance || 0.1,
            edgeDistance: params.edgeDistance || 50
        };
        this.simulationType = 'cpu';
    }

    setSimulationType(type) {
        if (type !== 'cpu' && type !== 'remote') {
            throw new Error('Invalid simulation type. Must be "cpu" or "remote".');
        }
        this.simulationType = type;
    }

    setSimulationParameters(params) {
        Object.assign(this.params, params);
    }

    computeCPU() {
        const EPSILON = 0.00001;

        for (let iteration = 0; iteration < this.params.iterations; iteration++) {
            // Reset forces
            this.nodes.forEach(node => {
                node.force = { x: 0, y: 0, z: 0 };
            });

            // Calculate repulsive forces between nodes
            for (let i = 0; i < this.nodes.length; i++) {
                for (let j = i + 1; j < this.nodes.length; j++) {
                    const nodeA = this.nodes[i];
                    const nodeB = this.nodes[j];
                    const dx = nodeB.x - nodeA.x;
                    const dy = nodeB.y - nodeA.y;
                    const dz = nodeB.z - nodeA.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || EPSILON;

                    if (distance < this.params.minDistance) continue;

                    const force = this.params.repulsion / (distance * distance);
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    const fz = (dz / distance) * force;

                    nodeA.force.x -= fx;
                    nodeA.force.y -= fy;
                    nodeA.force.z -= fz;
                    nodeB.force.x += fx;
                    nodeB.force.y += fy;
                    nodeB.force.z += fz;
                }
            }

            // Calculate attractive forces along edges
            this.edges.forEach(edge => {
                const source = this.nodes.find(n => n.id === edge.source);
                const target = this.nodes.find(n => n.id === edge.target_node);
                if (!source || !target) return;

                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const dz = target.z - source.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || EPSILON;

                const force = this.params.attraction * Math.max(distance - this.params.edgeDistance, 0) * edge.weight;
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                const fz = (dz / distance) * force;

                source.force.x += fx;
                source.force.y += fy;
                source.force.z += fz;
                target.force.x -= fx;
                target.force.y -= fy;
                target.force.z -= fz;
            });

            // Apply centering force
            this.nodes.forEach(node => {
                const distance = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z);
                if (distance > EPSILON) {
                    node.force.x -= (node.x / distance) * this.params.centeringForce;
                    node.force.y -= (node.y / distance) * this.params.centeringForce;
                    node.force.z -= (node.z / distance) * this.params.centeringForce;
                }
            });

            // Update velocities and positions
            this.nodes.forEach(node => {
                // Initialize velocity if not present
                node.vx = node.vx || 0;
                node.vy = node.vy || 0;
                node.vz = node.vz || 0;

                // Update velocity with force and damping
                node.vx = (node.vx + node.force.x) * this.params.damping;
                node.vy = (node.vy + node.force.y) * this.params.damping;
                node.vz = (node.vz + node.force.z) * this.params.damping;

                // Limit velocity
                const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy + node.vz * node.vz);
                if (speed > this.params.maxSpeed) {
                    const scale = this.params.maxSpeed / speed;
                    node.vx *= scale;
                    node.vy *= scale;
                    node.vz *= scale;
                }

                // Update position
                node.x += node.vx;
                node.y += node.vy;
                node.z += node.vz;
            });
        }
    }

    compute() {
        if (this.simulationType === 'cpu') {
            this.computeCPU();
        }
        // Remote simulation is handled by the server
    }

    getNodePositions() {
        return this.nodes.map(node => ({
            id: node.id,
            x: node.x,
            y: node.y,
            z: node.z
        }));
    }

    updateNodeData(nodes) {
        this.nodes = nodes.map(node => ({
            ...node,
            force: { x: 0, y: 0, z: 0 },
            vx: node.vx || 0,
            vy: node.vy || 0,
            vz: node.vz || 0
        }));
    }

    updateEdgeData(edges) {
        this.edges = edges;
    }
}
