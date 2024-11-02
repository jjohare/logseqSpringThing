export class LayoutManager {
    constructor() {
        this.forceDirectedIterations = 100;
        this.forceDirectedRepulsion = 1.0;
        this.forceDirectedAttraction = 0.01;
    }

    applyForceDirectedLayout(graphData) {
        console.log('Applying force-directed layout');
        const nodes = graphData.nodes;
        const edges = graphData.edges;

        // Initialize node velocities
        nodes.forEach(node => {
            node.vx = 0;
            node.vy = 0;
            node.vz = 0;
        });

        for (let iteration = 0; iteration < this.forceDirectedIterations; iteration++) {
            // Calculate repulsion between all nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    const dz = nodes[j].z - nodes[i].z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
                    const force = this.forceDirectedRepulsion / (distance * distance);

                    // Apply force with damping
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    const fz = (dz / distance) * force;

                    nodes[i].vx -= fx;
                    nodes[i].vy -= fy;
                    nodes[i].vz -= fz;
                    nodes[j].vx += fx;
                    nodes[j].vy += fy;
                    nodes[j].vz += fz;
                }
            }

            // Calculate attraction along edges
            edges.forEach(edge => {
                const source = nodes.find(node => node.id === edge.source);
                const target = nodes.find(node => node.id === edge.target_node);
                if (source && target) {
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const dz = target.z - source.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
                    const force = this.forceDirectedAttraction * distance;

                    // Apply force with damping
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    const fz = (dz / distance) * force;

                    source.vx += fx;
                    source.vy += fy;
                    source.vz += fz;
                    target.vx -= fx;
                    target.vy -= fy;
                    target.vz -= fz;
                }
            });

            // Update positions with velocity damping
            const damping = 0.9;
            nodes.forEach(node => {
                node.x += node.vx * damping;
                node.y += node.vy * damping;
                node.z += node.vz * damping;
                node.vx *= damping;
                node.vy *= damping;
                node.vz *= damping;
            });
        }

        console.log('Force-directed layout applied');
    }

    updateFeature(control, value) {
        switch (control) {
            case 'forceDirectedIterations':
                this.forceDirectedIterations = value;
                break;
            case 'forceDirectedRepulsion':
                this.forceDirectedRepulsion = value;
                break;
            case 'forceDirectedAttraction':
                this.forceDirectedAttraction = value;
                break;
        }
    }
}
