import * as THREE from 'three';

export class NodeManager {
    constructor(scene, font, params) {
        this.scene = scene;
        this.font = font;
        this.nodeMeshes = new Map();
        this.nodeLabels = new Map();
        this.params = params;
    }

    setGraphSimulation(simulation) {
        this.simulation = simulation;
    }

    createOrUpdateNode(node) {
        let mesh = this.nodeMeshes.get(node.id);

        if (!mesh) {
            const geometry = new THREE.IcosahedronGeometry(1, 1);
            const material = new THREE.MeshPhongMaterial({ color: this.params.nodeColor });
            mesh = new THREE.Mesh(geometry, material);
            mesh.userData.nodeId = node.id;
            this.scene.add(mesh);
            this.nodeMeshes.set(node.id, mesh);

            const label = this.createNodeLabel(node.label || node.id);
            this.scene.add(label);
            this.nodeLabels.set(node.id, label);
        }

        mesh.position.set(node.x, node.y, node.z);
        mesh.scale.setScalar(this.calculateNodeSize(node.size));
        mesh.material.color.setHex(this.params.nodeColor);

        const label = this.nodeLabels.get(node.id);
        if (label) {
            label.position.set(node.x, node.y + this.calculateNodeSize(node.size) + 2, node.z);
        }
    }

    calculateNodeSize(size) {
        return Math.min(size * this.params.nodeSizeScalingFactor, this.params.maxNodeSize);
    }

    createNodeLabel(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        context.font = `${this.params.labelFontSize}px Arial`;
        const metrics = context.measureText(text);
        const textWidth = metrics.width;
        const textHeight = this.params.labelFontSize + 10;
        canvas.width = textWidth + 10;
        canvas.height = textHeight;

        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.font = `${this.params.labelFontSize}px Arial`;
        context.fillStyle = 'white';
        context.fillText(text, 5, this.params.labelFontSize);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);

        spriteMaterial.depthWrite = false;
        spriteMaterial.transparent = true;

        return sprite;
    }

    updateNodes(nodes) {
        console.log(`NodeManager updating nodes: ${nodes.length}`);
        const existingNodeIds = new Set(nodes.map(node => node.id));

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

        nodes.forEach(node => {
            if (!node.id || typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') {
                console.warn('Invalid node data:', node);
                return;
            }
            this.createOrUpdateNode(node);
        });
    }

    setNodeColor(color) {
        this.params.nodeColor = color;
        this.nodeMeshes.forEach(mesh => {
            mesh.material.color.setHex(color);
        });
    }

    updateLabels(cameraPosition) {
        this.nodeLabels.forEach(label => {
            label.lookAt(cameraPosition);
        });
    }

    dispose() {
        this.nodeMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.nodeLabels.forEach(label => {
            this.scene.remove(label);
            if (label.material.map) label.material.map.dispose();
            label.material.dispose();
        });
        this.nodeMeshes.clear();
        this.nodeLabels.clear();
    }
}
