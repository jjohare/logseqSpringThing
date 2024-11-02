import * as THREE from 'three';

// Constants
export const BLOOM_LAYER = 1;
export const NORMAL_LAYER = 0;

export const NODE_COLORS = {
    NEW: new THREE.Color(0x0088ff),      // Blue for new files
    MEDIUM: new THREE.Color(0x00ff88),    // Green for medium-age files
    OLD: new THREE.Color(0xff8800)        // Orange for old files
};

export const NODE_SHAPES = {
    FEW_LINKS: 'sphere',      // 0-5 links
    MEDIUM_LINKS: 'box',      // 6-15 links
    MANY_LINKS: 'octahedron'  // 16+ links
};

export class NodeManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.nodeMeshes = new Map();
        this.nodeLabels = new Map();
        this.edgeMeshes = new Map();
        
        // Node settings
        this.minNodeSize = 5;  // Increased from 1
        this.maxNodeSize = 15; // Increased from 5
        this.nodeSizeScalingFactor = 2;  // Increased from 1
        this.labelFontSize = 48;
        this.nodeColor = 0x4444ff;  // Changed from 0x1A0B31 to a brighter blue

        // Edge settings
        this.edgeColor = 0x4444ff;
        this.edgeOpacity = 0.6;
    }

    calculateNodeSize(fileSize) {
        const logMin = Math.log(1);
        const logMax = Math.log(1e9); // 1GB as max reference
        const logSize = Math.log(fileSize + 1);
        
        const normalizedSize = (logSize - logMin) / (logMax - logMin);
        return this.minNodeSize + (this.maxNodeSize - this.minNodeSize) * normalizedSize;
    }

    calculateNodeColor(lastModified) {
        const now = Date.now();
        const age = now - new Date(lastModified).getTime();
        const dayInMs = 24 * 60 * 60 * 1000;
        
        if (age < 7 * dayInMs) return NODE_COLORS.NEW;
        if (age < 30 * dayInMs) return NODE_COLORS.MEDIUM;
        return NODE_COLORS.OLD;
    }

    createNodeGeometry(size, hyperlinkCount) {
        if (hyperlinkCount < 6) {
            return new THREE.SphereGeometry(size, 32, 32);
        } else if (hyperlinkCount < 16) {
            return new THREE.BoxGeometry(size, size, size);
        } else {
            return new THREE.OctahedronGeometry(size);
        }
    }

    createNodeLabel(text, fileSize, lastModified, hyperlinkCount) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `${this.labelFontSize}px Arial`;
        
        const nameMetrics = context.measureText(text);
        const infoText = `${this.formatFileSize(fileSize)} | ${this.formatAge(lastModified)} | ${hyperlinkCount} links`;
        const infoMetrics = context.measureText(infoText);
        
        const textWidth = Math.max(nameMetrics.width, infoMetrics.width);
        canvas.width = textWidth + 20;
        canvas.height = this.labelFontSize * 2 + 30;

        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.font = `${this.labelFontSize}px Arial`;
        context.fillStyle = 'white';
        context.fillText(text, 10, this.labelFontSize);
        
        context.font = `${this.labelFontSize / 2}px Arial`;
        context.fillStyle = 'lightgray';
        context.fillText(infoText, 10, this.labelFontSize + 20);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
        sprite.layers.set(NORMAL_LAYER);

        return sprite;
    }

    formatFileSize(size) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return `${size.toFixed(2)} ${units[i]}`;
    }

    formatAge(lastModified) {
        const now = Date.now();
        const age = now - new Date(lastModified).getTime();
        const days = Math.floor(age / (24 * 60 * 60 * 1000));
        
        if (days < 1) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        if (days < 30) return `${Math.floor(days / 7)}w ago`;
        if (days < 365) return `${Math.floor(days / 30)}m ago`;
        return `${Math.floor(days / 365)}y ago`;
    }

    updateNodes(nodes) {
        console.log(`Updating nodes: ${nodes.length}`);
        const existingNodeIds = new Set(nodes.map(node => node.id));

        // Remove non-existent nodes
        this.nodeMeshes.forEach((mesh, nodeId) => {
            if (!existingNodeIds.has(nodeId)) {
                this.scene.remove(mesh);
                this.nodeMeshes.delete(nodeId);
                const label = this.nodeLabels.get(nodeId);
                if (label) {
                    this.scene.remove(label);
                    this.nodeLabels.delete(nodeId);
                }
            }
        });

        // Update or create nodes
        nodes.forEach(node => {
            if (!node.id || typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') {
                console.warn('Invalid node data:', node);
                return;
            }

            const metadata = node.metadata || {};
            const fileSize = parseInt(metadata.file_size) || 1;
            const lastModified = metadata.last_modified || new Date().toISOString();
            const hyperlinkCount = parseInt(metadata.hyperlink_count) || 0;

            const size = this.calculateNodeSize(fileSize) * this.nodeSizeScalingFactor;
            const color = this.calculateNodeColor(lastModified);

            let mesh = this.nodeMeshes.get(node.id);

            if (!mesh) {
                const geometry = this.createNodeGeometry(size, hyperlinkCount);
                const material = new THREE.MeshStandardMaterial({
                    color: color,
                    metalness: 0.3,  // Reduced from 0.5
                    roughness: 0.3,  // Reduced from 0.5
                    emissive: color,
                    emissiveIntensity: 0.5  // Increased from 0.2
                });

                mesh = new THREE.Mesh(geometry, material);
                mesh.layers.enable(BLOOM_LAYER);
                this.scene.add(mesh);
                this.nodeMeshes.set(node.id, mesh);

                const label = this.createNodeLabel(node.label || node.id, fileSize, lastModified, hyperlinkCount);
                this.scene.add(label);
                this.nodeLabels.set(node.id, label);
            } else {
                mesh.geometry.dispose();
                mesh.geometry = this.createNodeGeometry(size, hyperlinkCount);
                mesh.material.color = color;
                mesh.material.emissive = color;
            }

            mesh.position.set(node.x, node.y, node.z);
            const label = this.nodeLabels.get(node.id);
            if (label) {
                label.position.set(node.x, node.y + size + 2, node.z);
            }
        });
    }

    updateEdges(edges) {
        console.log(`Updating edges: ${edges.length}`);
        const existingEdgeKeys = new Set(edges.map(edge => `${edge.source}-${edge.target_node}`));

        // Remove non-existent edges
        this.edgeMeshes.forEach((line, edgeKey) => {
            if (!existingEdgeKeys.has(edgeKey)) {
                this.scene.remove(line);
                this.edgeMeshes.delete(edgeKey);
            }
        });

        // Update or create edges
        edges.forEach(edge => {
            if (!edge.source || !edge.target_node) {
                console.warn('Invalid edge data:', edge);
                return;
            }

            const edgeKey = `${edge.source}-${edge.target_node}`;
            let line = this.edgeMeshes.get(edgeKey);
            const sourceMesh = this.nodeMeshes.get(edge.source);
            const targetMesh = this.nodeMeshes.get(edge.target_node);

            if (!line && sourceMesh && targetMesh) {
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array(6);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

                const material = new THREE.LineBasicMaterial({
                    color: this.edgeColor,
                    transparent: true,
                    opacity: this.edgeOpacity,
                    linewidth: 2
                });

                line = new THREE.Line(geometry, material);
                line.layers.set(NORMAL_LAYER);
                this.scene.add(line);
                this.edgeMeshes.set(edgeKey, line);
            }

            if (line && sourceMesh && targetMesh) {
                const positions = line.geometry.attributes.position.array;
                positions[0] = sourceMesh.position.x;
                positions[1] = sourceMesh.position.y;
                positions[2] = sourceMesh.position.z;
                positions[3] = targetMesh.position.x;
                positions[4] = targetMesh.position.y;
                positions[5] = targetMesh.position.z;
                line.geometry.attributes.position.needsUpdate = true;
            }
        });
    }

    updateLabelOrientations(camera) {
        this.nodeLabels.forEach(label => {
            label.lookAt(camera.position);
        });
    }

    updateFeature(control, value) {
        switch (control) {
            // Node features
            case 'nodeColor':
                this.nodeColor = value;
                this.nodeMeshes.forEach(mesh => {
                    mesh.material.color.setHex(value);
                    mesh.material.emissive.setHex(value);
                });
                break;
            case 'nodeSizeScalingFactor':
                this.nodeSizeScalingFactor = value;
                break;
            case 'labelFontSize':
                this.labelFontSize = value;
                break;

            // Edge features
            case 'edgeColor':
                this.edgeColor = value;
                this.edgeMeshes.forEach(line => {
                    line.material.color.setHex(value);
                });
                break;
            case 'edgeOpacity':
                this.edgeOpacity = value;
                this.edgeMeshes.forEach(line => {
                    line.material.opacity = value;
                });
                break;
        }
    }

    dispose() {
        // Dispose node resources
        this.nodeMeshes.forEach(mesh => {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.nodeLabels.forEach(label => {
            if (label.material.map) label.material.map.dispose();
            if (label.material) label.material.dispose();
        });

        // Dispose edge resources
        this.edgeMeshes.forEach(line => {
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        });
    }
}
