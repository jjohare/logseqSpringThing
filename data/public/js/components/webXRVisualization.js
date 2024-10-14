import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export class WebXRVisualization {
    static TRANSLATION_SPEED = 0.01;
    static ROTATION_SPEED = 0.01;

    static LAYERS = {
        ALL: 0,
        ENVIRONMENT: 1,
        NODES: 2,
        EDGES: 3,
    };

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
        this.bloomComposer = null;
        this.finalComposer = null;
        this.finalPass = null;

        this.nodeMeshes = new Map();
        this.edgeMeshes = new Map();
        this.nodeLabels = new Map();

        this.hologramGroup = new THREE.Group();
        this.animationFrameId = null;

        this.selectedNode = null;

        this.forceDirectedIterations = 100;
        this.forceDirectedRepulsion = 1.0;
        this.forceDirectedAttraction = 0.01;
        this.damping = 0.85;

        this.renderTargetScene = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
        this.renderTargetBloom = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

        this.darkMaterial = new THREE.MeshBasicMaterial({ color: 'black' });
        this.materials = {};

        this.bloomLayer = new THREE.Layers();
        this.bloomLayer.set(WebXRVisualization.LAYERS.NODES);

        this.initializeSettings();
        console.log('WebXRVisualization constructor completed');
    }

    initializeSettings() {
        console.log('Initializing settings');
        this.nodeColor = 0x1A0B31;
        this.edgeColor = 0xff0000;
        this.hologramColor = 0xFFD700;
        this.nodeSizeScalingFactor = 1;
        this.hologramScale = 1;
        this.hologramOpacity = 0.1;
        this.edgeOpacity = 0.3;
        this.labelFontSize = 48;
        this.fogDensity = 0.002;
        this.minNodeSize = 1;
        this.maxNodeSize = 5;
        this.bloomStrength = 1.5;
        this.bloomRadius = 0.4;
        this.bloomThreshold = 0.2;
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

        // Add debug cube
        const debugGeometry = new THREE.BoxGeometry(50, 50, 50);
        const debugMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const debugCube = new THREE.Mesh(debugGeometry, debugMaterial);
        debugCube.position.set(0, 0, 0);
        debugCube.layers.set(WebXRVisualization.LAYERS.NODES);
        this.scene.add(debugCube);

        this.onWindowResize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.onWindowResize, false);

        this.animate();
        console.log('Three.js initialization completed');
    }

    initPostProcessing() {
        console.log('Initializing post-processing');

        this.bloomComposer = new EffectComposer(this.renderer);
        this.bloomComposer.renderToScreen = false;

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.bloomStrength,
            this.bloomRadius,
            this.bloomThreshold
        );
        this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
        this.bloomComposer.addPass(bloomPass);

        this.finalComposer = new EffectComposer(this.renderer);
        this.finalComposer.addPass(new RenderPass(this.scene, this.camera));

        this.finalPass = new ShaderPass(
            new THREE.ShaderMaterial({
                uniforms: {
                    baseTexture: { value: null },
                    bloomTexture: { value: null }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D baseTexture;
                    uniform sampler2D bloomTexture;
                    varying vec2 vUv;

                    void main() {
                        vec4 baseColor = texture2D(baseTexture, vUv);
                        vec4 bloomColor = texture2D(bloomTexture, vUv);
                        gl_FragColor = baseColor + bloomColor;
                    }
                `,
                defines: {}
            }), 'baseTexture'
        );
        this.finalPass.needsSwap = true;
        this.finalComposer.addPass(this.finalPass);

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
        buckySphere.layers.set(WebXRVisualization.LAYERS.ENVIRONMENT);
        this.hologramGroup.add(buckySphere);

        const geodesicGeometry = new THREE.IcosahedronGeometry(10 * this.hologramScale, 1);
        const geodesicMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const geodesicDome = new THREE.Mesh(geodesicGeometry, geodesicMaterial);
        geodesicDome.userData.rotationSpeed = 0.0002;
        geodesicDome.layers.set(WebXRVisualization.LAYERS.ENVIRONMENT);
        this.hologramGroup.add(geodesicDome);

        const triangleGeometry = new THREE.SphereGeometry(100 * this.hologramScale, 32, 32);
        const triangleMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const triangleSphere = new THREE.Mesh(triangleGeometry, triangleMaterial);
        triangleSphere.userData.rotationSpeed = 0.0003;
        triangleSphere.layers.set(WebXRVisualization.LAYERS.ENVIRONMENT);
        this.hologramGroup.add(triangleSphere);

        this.scene.add(this.hologramGroup);
        console.log('Hologram structure created');
    }

    updateVisualization() {
        console.log('Updating visualization');
        const graphData = this.graphDataManager.getGraphData();
        if (!graphData || !graphData.nodes || !graphData.edges) {
            console.warn('Incomplete graph data for visualization update');
            return;
        }
        console.log('Graph data received:', graphData);
        
        this.applyForceDirectedLayout(graphData);
        
        this.updateNodes(graphData.nodes);
        this.updateEdges(graphData.edges);
        console.log('Visualization update completed');
    }

    applyForceDirectedLayout(graphData) {
        console.log('Applying force-directed layout');
        const nodes = graphData.nodes;
        const edges = graphData.edges;

        for (let iteration = 0; iteration < this.forceDirectedIterations; iteration++) {
            for (let i = 0; i < nodes.length; i++) {
                nodes[i].vx = nodes[i].vx || 0;
                nodes[i].vy = nodes[i].vy || 0;
                nodes[i].vz = nodes[i].vz || 0;

                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    const dz = nodes[j].z - nodes[i].z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (distance < 1e-6) continue;
                    const force = this.forceDirectedRepulsion / (distance * distance);

                    nodes[i].vx -= dx * force / distance;
                    nodes[i].vy -= dy * force / distance;
                    nodes[i].vz -= dz * force / distance;
                    nodes[j].vx += dx * force / distance;
                    nodes[j].vy += dy * force / distance;
                    nodes[j].vz += dz * force / distance;
                }
            }

            for (const edge of edges) {
                const source = nodes.find(node => node.id === edge.source);
                const target = nodes.find(node => node.id === edge.target_node);
                if (source && target) {
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const dz = target.z - source.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (distance < 1e-6) continue;
                    const force = this.forceDirectedAttraction * distance;

                    source.vx += dx * force / distance;
                    source.vy += dy * force / distance;
                    source.vz += dz * force / distance;
                    target.vx -= dx * force / distance;
                    target.vy -= dy * force / distance;
                    target.vz -= dz * force / distance;
                }
            }

            // Apply velocities and damping
            for (const node of nodes) {
                node.vx *= this.damping;
                node.vy *= this.damping;
                node.vz *= this.damping;

                node.x += node.vx;
                node.y += node.vy;
                node.z += node.vz;
            }
        }

        console.log('Force-directed layout applied');
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
            const size = this.calculateNodeSize(fileSize);
            const lastModified = node.metadata && node.metadata.last_modified ? new Date(node.metadata.last_modified) : new Date();
            const color = this.calculateNodeColor(lastModified);

            console.log(`Node ${node.id}: fileSize = ${fileSize}, calculated size = ${size}`);

            if (!mesh) {
                const geometry = this.createNodeGeometry(size, fileSize);
                const material = new THREE.MeshStandardMaterial({ color: color });
                mesh = new THREE.Mesh(geometry, material);
                mesh.layers.set(WebXRVisualization.LAYERS.NODES);
                this.scene.add(mesh);
                this.nodeMeshes.set(node.id, mesh);

                const label = this.createNodeLabel(node.label || node.id, fileSize);
                this.scene.add(label);
                this.nodeLabels.set(node.id, label);
            } else {
                this.updateNodeGeometry(mesh, size, fileSize);
                mesh.material.color.setHex(color);
            }

            mesh.position.set(node.x, node.y, node.z);
            const label = this.nodeLabels.get(node.id);
            if (label) {
                label.position.set(node.x, node.y + size + 2, node.z);
                this.updateNodeLabel(label, node.label || node.id, fileSize);
            }
        });
    }

    calculateNodeSize(fileSize) {
        const logSize = Math.log(fileSize + 1) / Math.log(10);
        return Math.max(this.minNodeSize, Math.min(this.maxNodeSize, logSize * this.nodeSizeScalingFactor));
    }

    calculateNodeColor(lastModified) {
        const now = Date.now();
        const timeDifference = now - lastModified.getTime();
        const maxAge = 1000 * 60 * 60 * 24 * 30;
        const t = Math.min(timeDifference / maxAge, 1);
        const r = Math.floor(255 * (1 - t));
        const g = Math.floor(255 * t);
        const b = 100;
        return (r << 16) | (g << 8) | b;
    }

    createNodeGeometry(size, fileSize) {
        if (fileSize < 1000) {
            return new THREE.SphereGeometry(size, 16, 16);
        } else if (fileSize < 1000000) {
            return new THREE.BoxGeometry(size, size, size);
        } else {
            return new THREE.OctahedronGeometry(size);
        }
    }

    updateNodeGeometry(mesh, size, fileSize) {
        const newGeometry = this.createNodeGeometry(size, fileSize);
        mesh.geometry.dispose();
        mesh.geometry = newGeometry;
    }

    createNodeLabel(text, fileSize) {
        const canvasWidth = 256;
        const canvasHeight = 64;
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext('2d');

        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = `${this.labelFontSize}px Arial`;
        context.fillStyle = 'white';
        context.fillText(text, 10, this.labelFontSize, canvasWidth - 20);
        
        context.font = `${this.labelFontSize / 2}px Arial`;
        context.fillStyle = 'lightgray';
        context.fillText(this.formatFileSize(fileSize), 10, this.labelFontSize + 20, canvasWidth - 20);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
        sprite.layers.set(WebXRVisualization.LAYERS.NODES);

        spriteMaterial.depthWrite = false;
        spriteMaterial.transparent = true;

        sprite.userData.text = text;
        sprite.userData.fileSize = fileSize;
        return sprite;
    }

    updateNodeLabel(label, text, fileSize) {
        if (label.userData.text === text && label.userData.fileSize === fileSize) {
            return; // No change, skip update
        }

        const canvas = label.material.map.image;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);

        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = `${this.labelFontSize}px Arial`;
        context.fillStyle = 'white';
        context.fillText(text, 10, this.labelFontSize, canvas.width - 20);
        
        context.font = `${this.labelFontSize / 2}px Arial`;
        context.fillStyle = 'lightgray';
        context.fillText(this.formatFileSize(fileSize), 10, this.labelFontSize + 20, canvas.width - 20);

        if (label.material.map) {
            label.material.map.dispose();
        }
        label.material.map = new THREE.CanvasTexture(canvas);
        label.material.map.needsUpdate = true;
        label.userData.text = text;
        label.userData.fileSize = fileSize;
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
                    line.layers.set(WebXRVisualization.LAYERS.EDGES);
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
                line.material.needsUpdate = true;
            } else {
                console.warn(`Unable to update edge: ${edgeKey}. Source or target node not found.`);
            }
        });
    }

    renderBloom(mask) {
        if (mask) {
            this.scene.traverse((obj) => {
                if (obj.isMesh && (obj.layers.mask & this.bloomLayer.mask) === 0) {
                    this.materials[obj.uuid] = obj.material;
                    obj.material = this.darkMaterial;
                }
            });
        }

        this.bloomComposer.render();

        if (mask) {
            this.scene.traverse((obj) => {
                if (this.materials[obj.uuid]) {
                    obj.material = this.materials[obj.uuid];
                    delete this.materials[obj.uuid];
                }
            });
        }
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        this.controls.update();

        this.hologramGroup.children.forEach(child => {
            child.rotation.x += child.userData.rotationSpeed;
            child.rotation.y += child.userData.rotationSpeed;
        });

        const worldPosition = new THREE.Vector3();
        this.camera.getWorldPosition(worldPosition);
        this.nodeLabels.forEach(label => {
            label.lookAt(worldPosition);
        });

        // Render the scene into the render target
        this.renderer.setRenderTarget(this.renderTargetScene);
        this.renderer.clear();
        this.camera.layers.set(WebXRVisualization.LAYERS.ALL);
        this.renderer.render(this.scene, this.camera);

        // Update the baseTexture uniform
        this.finalPass.material.uniforms.baseTexture.value = this.renderTargetScene.texture;

        // Render bloom
        this.camera.layers.set(this.bloomLayer.mask);
        this.renderBloom(true);

        // Update the bloomTexture uniform
        this.finalPass.material.uniforms.bloomTexture.value = this.bloomComposer.renderTarget2.texture;

        // Reset camera layers
        this.camera.layers.set(WebXRVisualization.LAYERS.ALL);

        // Render the final composite
        this.renderer.setRenderTarget(null); // Render to screen
        this.finalComposer.render();
    }

    onWindowResize() {
        console.log('Window resized');
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        if (this.bloomComposer && this.finalComposer) {
            this.bloomComposer.setSize(window.innerWidth, window.innerHeight);
            this.finalComposer.setSize(window.innerWidth, window.innerHeight);
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
        this.nodeLabels.forEach(label => {
            if (label.material.map) {
                label.material.map.dispose();
            }
            label.material.dispose();
            this.scene.remove(label);
        });
        this.renderer.dispose();
        if (this.controls) {
            this.controls.dispose();
        }
        window.removeEventListener('resize', this.onWindowResize, false);
        console.log('WebXRVisualization disposed');
    }

    updateVisualFeatures(changes) {
        console.log('Updating visual features:', changes);
        let needsUpdate = false;
        let bloomChanged = false;
        let layoutChanged = false;

        for (const [name, value] of Object.entries(changes)) {
            if (this.hasOwnProperty(name)) {
                console.log(`Setting property ${name} to`, value);
                this[name] = value;
                needsUpdate = true;

                if (name.includes('bloom')) {
                    bloomChanged = true;
                }

                if (name.includes('forceDirected')) {
                    layoutChanged = true;
                }
            } else {
                console.warn(`Property ${name} does not exist on WebXRVisualization`);
            }
        }

        if (needsUpdate) {
            if (layoutChanged) {
                this.updateVisualization();
            } else {
                this.updateNodes(this.graphDataManager.getGraphData().nodes);
                this.updateEdges(this.graphDataManager.getGraphData().edges);
            }
            
            if (changes.hologramScale !== undefined) {
                this.hologramGroup.scale.set(this.hologramScale, this.hologramScale, this.hologramScale);
            }
        }

        if (bloomChanged) {
            this.updateBloomPass();
        }

        this.finalComposer.render();
        console.log('Visual features update completed');
    }

    updateBloomPass() {
        console.log('Updating bloom pass');
        const bloomPass = this.bloomComposer.passes.find(pass => pass instanceof UnrealBloomPass);
        if (bloomPass) {
            bloomPass.strength = this.bloomStrength;
            bloomPass.radius = this.bloomRadius;
            bloomPass.threshold = this.bloomThreshold;
            console.log('Bloom pass updated:', {
                strength: this.bloomStrength,
                radius: this.bloomRadius,
                threshold: this.bloomThreshold
            });
        }
    }

    handleSpacemouseInput(x, y, z, rx, ry, rz) {
        if (!this.camera || !this.controls) {
            console.warn('Camera or controls not initialized for Spacemouse input');
            return;
        }

        this.controls.rotateLeft(ry * WebXRVisualization.ROTATION_SPEED);
        this.controls.rotateUp(rx * WebXRVisualization.ROTATION_SPEED);
        this.controls.pan(-x * WebXRVisualization.TRANSLATION_SPEED, y * WebXRVisualization.TRANSLATION_SPEED);
        this.controls.dolly(z * WebXRVisualization.TRANSLATION_SPEED);
        this.controls.update();
    }

    debugLabels() {
        console.log('Debugging labels');
        console.log('Total labels:', this.nodeLabels.size);

        this.camera.updateMatrixWorld();
        this.camera.updateProjectionMatrix();

        const frustum = new THREE.Frustum();
        const cameraViewProjectionMatrix = new THREE.Matrix4();
        cameraViewProjectionMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(cameraViewProjectionMatrix);

        this.nodeLabels.forEach((label, nodeId) => {
            console.log(`Label for node ${nodeId}:`, {
                position: label.position.toArray(),
                visible: label.visible,
                inFrustum: frustum.containsPoint(label.position),
                material: {
                    color: label.material.color.getHex(),
                    opacity: label.material.opacity,
                    transparent: label.material.transparent,
                    visible: label.material.visible
                },
                geometry: {
                    type: label.geometry.type,
                    parameters: label.geometry.parameters
                }
            });
        });
    }
}
