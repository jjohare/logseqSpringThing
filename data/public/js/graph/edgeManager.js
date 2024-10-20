import * as THREE from 'three';
import { getEdgeColor } from '../utils/colorUtils.js';

export class EdgeManager {
    constructor(scene, simulation, params) {
        this.scene = scene;
        this.simulation = simulation;
        this.edgeMeshes = new Map();
        this.edgeOpacity = params.edgeOpacity || 0.3;
        this.edgeColor = params.edgeColor || 0xffffff;
    }

    setGraphSimulation(simulation) {
        this.simulation = simulation;
    }

    setEdgeOpacity(opacity) {
        this.edgeOpacity = opacity;
        this.edgeMeshes.forEach(line => {
            line.material.opacity = opacity;
            line.material.needsUpdate = true;
        });
    }

    setEdgeColor(color) {
        this.edgeColor = color;
        this.edgeMeshes.forEach(line => {
            line.material.color.setHex(color);
            line.material.needsUpdate = true;
        });
    }

    createOrUpdateEdge(edge) {
        const edgeKey = `${edge.source}-${edge.target}`;
        let line = this.edgeMeshes.get(edgeKey);

        const source = this.simulation.nodes.find(node => node.id === edge.source);
        const target = this.simulation.nodes.find(node => node.id === edge.target);
        if (!source || !target) {
            console.warn(`Cannot create edge: source or target node not found for edge ${edgeKey}`);
            return;
        }

        if (!line) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(source.x, source.y, source.z),
                new THREE.Vector3(target.x, target.y, target.z)
            ]);
            const material = new THREE.LineBasicMaterial({
                color: this.edgeColor,
                transparent: true,
                opacity: this.edgeOpacity
            });
            line = new THREE.Line(geometry, material);
            this.scene.add(line);
            this.edgeMeshes.set(edgeKey, line);
        } else {
            const positions = line.geometry.attributes.position.array;
            positions[0] = source.x;
            positions[1] = source.y;
            positions[2] = source.z;
            positions[3] = target.x;
            positions[4] = target.y;
            positions[5] = target.z;
            line.geometry.attributes.position.needsUpdate = true;
        }
    }

    updateEdges(edges) {
        console.log(`EdgeManager updating edges: ${edges.length}`);
        const existingEdgeKeys = new Set(edges.map(edge => `${edge.source}-${edge.target}`));

        this.edgeMeshes.forEach((line, edgeKey) => {
            if (!existingEdgeKeys.has(edgeKey)) {
                this.scene.remove(line);
                this.edgeMeshes.delete(edgeKey);
                line.geometry.dispose();
                line.material.dispose();
            }
        });

        edges.forEach(edge => {
            if (!edge.source || !edge.target) {
                console.warn('Invalid edge data:', edge);
                return;
            }
            this.createOrUpdateEdge(edge);
        });
    }

    dispose() {
        this.edgeMeshes.forEach(line => {
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        this.edgeMeshes.clear();
    }
}
