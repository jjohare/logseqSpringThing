import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Constants for Spacemouse sensitivity
const TRANSLATION_SPEED = 0.01;
const ROTATION_SPEED = 0.01;

export class WebXRVisualization {
    constructor(graphDataManager) {
        console.log('WebXRVisualization constructor called');
        this.graphDataManager = graphDataManager;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 0, 500);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.toneMappingExposure = 1;
        
        this.controls = null;
        this.composer = null;

        this.nodeMeshes = new Map();
        this.edgeMeshes = new Map();
        this.nodeLabels = new Map();

        this.hologramGroup = new THREE.Group();
        this.animationFrameId = null;

        this.selectedNode = null;

        this.initializeSettings();
        console.log('WebXRVisualization constructor completed');
    }

    initializeSettings() {
        console.log('Initializing settings');
        this.nodeColor = 0x1A0B31;
        this.edgeColor = 0xff0000;
        this.hologramColor = 0xFFD700;
        this.nodeSizeScalingFactor = 1000;
        this.hologramScale = 1;
        this.hologramOpacity = 0.1;
        this.edgeOpacity = 0.3;
        this.labelFontSize = 48;
        this.fogDensity = 0.002;
        this.minNodeSize = 1;
        this.maxNodeSize = 10;
        this.nodeBloomStrength = 0.1;
        this.nodeBloomRadius = 0.1;
        this.nodeBloomThreshold = 0;
        this.edgeBloomStrength = 0.2;
        this.edgeBloomRadius = 0.3;
        this.edgeBloomThreshold = 0;
        this.environmentBloomStrength = 1;
        this.environmentBloomRadius = 1;
        this.environmentBloomThreshold = 0;
        console.log('Settings initialized');
    }

    initThreeJS() {
        console.log('Initializing Three.js');
        const container = document.getElementById('scene-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        } else {
            console.error("Could not find 'scene-container' element");
            return;
        }

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        this.scene.fog = new THREE.FogExp2(0x000000, this.fogDensity);
        this.addLights();
        this.initPostProcessing();
        this.createHologramStructure();

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.animate();
        console.log('Three.js initialization completed');
    }

    initPostProcessing() {
        console.log('Initializing post-processing');
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.environmentBloomStrength,
            this.environmentBloomRadius,
            this.environmentBloomThreshold
        );
        this.composer.addPass(this.bloomPass);
        console.log('Post-processing initialized');
    }

    addLights() {
        console.log('Adding lights to the scene');
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 50, 50);
        this.scene.add(directionalLight);
        console.log('Lights added to the scene');
    }

    createHologramStructure() {
        console.log('Creating hologram structure');
        this.hologramGroup.clear();

        const buckyGeometry = new THREE.IcosahedronGeometry(40 * this.hologramScale, 1);
        const buckyMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const buckySphere = new THREE.Mesh(buckyGeometry, buckyMaterial);
        buckySphere.userData.rotationSpeed = 0.0001;
        buckySphere.layers.enable(1);
        this.hologramGroup.add(buckySphere);

        const geodesicGeometry = new THREE.IcosahedronGeometry(30 * this.hologramScale, 1);
        const geodesicMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const geodesicDome = new THREE.Mesh(geodesicGeometry, geodesicMaterial);
        geodesicDome.userData.rotationSpeed = 0.0002;
        geodesicDome.layers.enable(1);
        this.hologramGroup.add(geodesicDome);

        const triangleGeometry = new THREE.SphereGeometry(20 * this.hologramScale, 32, 32);
        const triangleMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const triangleSphere = new THREE.Mesh(triangleGeometry, triangleMaterial);
        triangleSphere.userData.rotationSpeed = 0.0003;
        triangleSphere.layers.enable(1);
        this.hologramGroup.add(triangleSphere);

        this.scene.add(this.hologramGroup);
        console.log('Hologram structure created');
    }

    updateVisualization() {
        console.log('Updating visualization');
        const graphData = this.graphDataManager.getGraphData();
        if (!graphData) {
            console.warn('No graph data available for visualization update');
            return;
        }
        console.log('Graph data received:', graphData);
        this.updateNodes(graphData.nodes);
        this.updateEdges(graphData.edges);
        console.log('Visualization update completed');
    }

    updateVisualFeatures(changes) {
        console.log('Updating visual features:', changes);
        let needsUpdate = false;

        for (const [name, value] of Object.entries(changes)) {
            if (this.hasOwnProperty(name)) {
                console.log(`Setting property ${name} to`, value);
                this[name] = value;
                needsUpdate = true;
            } else {
                console.warn(`Property ${name} does not exist on WebXRVisualization`);
            }
        }

        if (needsUpdate) {
            this.updateVisualization();
            this.updateBloomPass();
            this.composer.render();
        }
        console.log('Visual features update completed');
    }

    updateNodes(nodes) {
        console.log(`Updating nodes: ${nodes.length}`);
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
            let mesh = this.nodeMeshes.get(node.id);
            const fileSize = node.metadata && node.metadata.file_size ? parseInt(node.metadata.file_size) : 1;
            if (isNaN(fileSize) || fileSize <= 0) {
                console.warn(`Invalid file_size for node ${node.id}:`, node.metadata.file_size);
                return;
            }
            const size = Math.max(this.minNodeSize, Math.min(this.maxNodeSize, Math.sqrt(fileSize) / this.nodeSizeScalingFactor));

            if (!mesh) {
                const geometry = new THREE.SphereGeometry(size, 32, 32);
                const material = new THREE.MeshStandardMaterial({ color: this.nodeColor });
                mesh = new THREE.Mesh(geometry, material);
                mesh.layers.enable(1);
                this.scene.add(mesh);
                this.nodeMeshes.set(node.id, mesh);

                const label = this.createNodeLabel(node.label || node.id);
                this.scene.add(label);
                this.nodeLabels.set(node.id, label);
            } else {
                mesh.scale.setScalar(size);
                mesh.material.color.setHex(this.nodeColor);
            }

            mesh.position.set(node.x, node.y, node.z);
            const label = this.nodeLabels.get(node.id);
            label.position.set(node.x, node.y + size + 2, node.z);
        });
        console.log(`Node color set to: ${this.nodeColor.toString(16)}`);
    }

    updateEdges(edges) {
        console.log(`Updating edges: ${edges.length}`);
        const existingEdgeKeys = new Set(edges.map(edge => `${edge.source}-${edge.target_node}`));

        this.edgeMeshes.forEach((line, edgeKey) => {
            if (!existingEdgeKeys.has(edgeKey)) {
                this.scene.remove(line);
                this.edgeMeshes.delete(edgeKey);
            }
        });

        edges.forEach(edge => {
            if (!edge.source || !edge.target_node) {
                console.warn('Invalid edge data:', edge);
                return;
            }
            const edgeKey = `${edge.source}-${edge.target_node}`;
            let line = this.edgeMeshes.get(edgeKey);
            const sourceMesh = this.nodeMeshes.get(edge.source);
            const targetMesh = this.nodeMeshes.get(edge.target_node);
            
            if (!line) {
                if (sourceMesh && targetMesh) {
                    const geometry = new THREE.BufferGeometry().setFromPoints([
                        sourceMesh.position,
                        targetMesh.position
                    ]);
                    const material = new THREE.LineBasicMaterial({
                        color: this.edgeColor,
                        transparent: true,
                        opacity: this.edgeOpacity
                    });
                    line = new THREE.Line(geometry, material);
                    line.layers.enable(1);
                    this.scene.add(line);
                    this.edgeMeshes.set(edgeKey, line);
                } else {
                    console.warn(`Unable to create edge: ${edgeKey}. Source or target node not found.`);
                }
            } else if (sourceMesh && targetMesh) {
                const positions = line.geometry.attributes.position.array;
                positions[0] = sourceMesh.position.x;
                positions[1] = sourceMesh.position.y;
                positions[2] = sourceMesh.position.z;
                positions[3] = targetMesh.position.x;
                positions[4] = targetMesh.position.y;
                positions[5] = targetMesh.position.z;
                line.geometry.attributes.position.needsUpdate = true;
                line.material.color.setHex(this.edgeColor);
                line.material.opacity = this.edgeOpacity;
                line.material.needsUpdate = true; // Ensure the material updates
            } else {
                console.warn(`Unable to update edge: ${edgeKey}. Source or target node not found.`);
            }
        });
        console.log(`Edge color set to: ${this.edgeColor.toString(16)}, opacity: ${this.edgeOpacity}`);
    }

    createNodeLabel(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `${this.labelFontSize}px Arial`;
        const metrics = context.measureText(text);
        const textWidth = metrics.width;

        canvas.width = textWidth + 10;
        canvas.height = this.labelFontSize + 10;

        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = `${this.labelFontSize}px Arial`;
        context.fillStyle = 'white';
        context.fillText(text, 5, this.labelFontSize);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
        sprite.layers.set(1);

        spriteMaterial.depthWrite = false;
        spriteMaterial.transparent = true;

        return sprite;
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        this.controls.update();

        this.hologramGroup.children.forEach(child => {
            child.rotation.x += child.userData.rotationSpeed;
            child.rotation.y += child.userData.rotationSpeed;
        });

        this.composer.render();
    }

    onWindowResize() {
        console.log('Window resized');
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    dispose() {
        console.log('Disposing WebXRVisualization');
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.scene.traverse(object => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        this.renderer.dispose();
        if (this.controls) {
            this.controls.dispose();
        }
        console.log('WebXRVisualization disposed');
    }

    updateNodeLabels() {
        console.log('Updating node labels');
        this.nodeLabels.forEach((label, nodeId) => {
            const node = this.nodeMeshes.get(nodeId);
            if (node) {
                this.scene.remove(label);
                const newLabel = this.createNodeLabel(label.userData.text);
                newLabel.position.copy(label.position);
                this.scene.add(newLabel);
                this.nodeLabels.set(nodeId, newLabel);
            }
        });
        console.log('Node labels update completed');
    }

    updateBloomPass() {
        console.log('Updating bloom pass');
        if (this.bloomPass) {
            this.bloomPass.strength = this.environmentBloomStrength;
            this.bloomPass.radius = this.environmentBloomRadius;
            this.bloomPass.threshold = this.environmentBloomThreshold;
        }
        console.log('Bloom pass update completed');
    }

    handleSpacemouseInput(x, y, z, rx, ry, rz) {
        if (!this.camera || !this.controls) {
            console.warn('Camera or controls not initialized for Spacemouse input');
            return;
        }

        this.camera.position.x += x * TRANSLATION_SPEED;
        this.camera.position.y += y * TRANSLATION_SPEED;
        this.camera.position.z += z * TRANSLATION_SPEED;
        
        this.camera.rotation.x += rx * ROTATION_SPEED;
        this.camera.rotation.y += ry * ROTATION_SPEED;
        this.camera.rotation.z += rz * ROTATION_SPEED;

        this.controls.update();
    }
}