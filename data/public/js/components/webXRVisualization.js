import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * WebXRVisualization
 * 
 * This class manages the 3D visualization of a graph using Three.js.
 * It handles the creation and updating of nodes, edges, labels, and a hologram structure.
 * Post-processing effects and debug elements have been removed for simplicity.
 */
export class WebXRVisualization {
    // Constants for Spacemouse sensitivity
    static TRANSLATION_SPEED = 0.01;
    static ROTATION_SPEED = 0.01;

    constructor(graphDataManager) {
        console.log('WebXRVisualization constructor called');
        this.graphDataManager = graphDataManager;

        // Initialize Three.js essentials
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        this.camera.position.set(0, 0, 500);
        this.camera.lookAt(0, 0, 0); // Ensure the camera looks at the origin

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.toneMappingExposure = 1;

        this.controls = null;

        // Maps to store node and edge meshes and labels
        this.nodeMeshes = new Map();
        this.edgeMeshes = new Map();
        this.nodeLabels = new Map();

        // Group for hologram structures
        this.hologramGroup = new THREE.Group();

        this.animationFrameId = null;

        this.selectedNode = null;

        // Force-directed layout parameters
        this.forceDirectedIterations = 100;
        this.forceDirectedRepulsion = 1.0;
        this.forceDirectedAttraction = 0.01;
        this.damping = 0.85;

        // Materials for temporarily hiding objects during selective rendering
        this.darkMaterial = new THREE.MeshBasicMaterial({ color: 'black' });
        this.materials = {};

        // Initialize settings and Three.js
        this.initializeSettings();
        console.log('WebXRVisualization constructor completed');
    }

    /**
     * Initializes various settings for the visualization.
     */
    initializeSettings() {
        console.log('Initializing settings');
        this.nodeColor = 0x1A0B31;
        this.edgeColor = 0xff0000;
        this.hologramColor = 0xFFD700;
        this.hologramScale = 1;
        this.hologramOpacity = 0.1;
        this.edgeOpacity = 0.3;
        this.labelFontSize = 20;
        this.fogDensity = 0.002;
        this.nodeSizeScalingFactor = 0.5; // Adjust this value as needed
        console.log('Settings initialized');
    }

    /**
     * Initializes Three.js components, including renderer, controls, lights, and hologram structure.
     */
    initThreeJS() {
        console.log('Initializing Three.js');
        const container = document.getElementById('scene-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        } else {
            console.error("Could not find 'scene-container' element");
            return;
        }

        // Set up OrbitControls for camera manipulation
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Add exponential fog to the scene
        this.scene.fog = new THREE.FogExp2(0x000000, this.fogDensity);

        // Add lighting to the scene
        this.addLights();

        // Create hologram structures
        this.createHologramStructure();

        // Add event listener for window resize
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Start the animation loop
        this.animate();
        console.log('Three.js initialization completed');
    }

    /**
     * Adds ambient and directional lights to the scene.
     */
    addLights() {
        console.log('Adding lights to the scene');
        const ambientLight = new THREE.AmbientLight(0x404040, 1.5); // Soft white light
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 50, 50);
        this.scene.add(directionalLight);
        console.log('Lights added to the scene');
    }

    /**
     * Creates the hologram structure composed of various wireframe geometries.
     */
    createHologramStructure() {
        console.log('Creating hologram structure');
        this.hologramGroup.clear();

        // Icosahedron for hologram
        const buckyGeometry = new THREE.IcosahedronGeometry(40 * this.hologramScale, 1);
        const buckyMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const buckySphere = new THREE.Mesh(buckyGeometry, buckyMaterial);
        buckySphere.userData.rotationSpeed = 0.0001;
        this.hologramGroup.add(buckySphere);

        // Geodesic dome
        const geodesicGeometry = new THREE.IcosahedronGeometry(10 * this.hologramScale, 1);
        const geodesicMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const geodesicDome = new THREE.Mesh(geodesicGeometry, geodesicMaterial);
        geodesicDome.userData.rotationSpeed = 0.0002;
        this.hologramGroup.add(geodesicDome);

        // Sphere for hologram
        const triangleGeometry = new THREE.SphereGeometry(100 * this.hologramScale, 32, 32);
        const triangleMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const triangleSphere = new THREE.Mesh(triangleGeometry, triangleMaterial);
        triangleSphere.userData.rotationSpeed = 0.0003;
        this.hologramGroup.add(triangleSphere);

        this.scene.add(this.hologramGroup);
        console.log('Hologram structure created');
    }

    /**
     * Updates the visualization based on the latest graph data.
     */
    updateVisualization() {
        console.log('Updating visualization');
        const graphData = this.graphDataManager.getGraphData();
        if (!graphData) {
            console.warn('No graph data available for visualization update');
            return;
        }
        console.log('Graph data received:', graphData);

        this.applyForceDirectedLayout(graphData);
        this.updateNodes(graphData.nodes);
        this.updateEdges(graphData.edges);
        console.log('Visualization update completed');
    }

    /**
     * Applies a basic force-directed layout to position nodes.
     * @param {Object} graphData - The graph data containing nodes and edges.
     */
    applyForceDirectedLayout(graphData) {
        console.log('Applying force-directed layout');
        const nodes = graphData.nodes;
        const edges = graphData.edges;

        for (let iteration = 0; iteration < this.forceDirectedIterations; iteration++) {
            // Apply repulsion between nodes
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

                    nodes[i].vx -= (dx * force) / distance;
                    nodes[i].vy -= (dy * force) / distance;
                    nodes[i].vz -= (dz * force) / distance;
                    nodes[j].vx += (dx * force) / distance;
                    nodes[j].vy += (dy * force) / distance;
                    nodes[j].vz += (dz * force) / distance;
                }
            }

            // Apply attraction along edges
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

                    source.vx += (dx * force) / distance;
                    source.vy += (dy * force) / distance;
                    source.vz += (dz * force) / distance;
                    target.vx -= (dx * force) / distance;
                    target.vy -= (dy * force) / distance;
                    target.vz -= (dz * force) / distance;
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

    /**
     * Updates or creates node meshes based on the provided nodes data.
     * @param {Array} nodes - Array of node objects.
     */
    updateNodes(nodes) {
        console.log(`Updating nodes: ${nodes.length}`);
        const existingNodeIds = new Set(nodes.map(node => node.id));

        // Remove meshes and labels for nodes that no longer exist
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

        // Update or create meshes and labels for existing nodes
        nodes.forEach(node => {
            if (!node.id || typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') {
                console.warn('Invalid node data:', node);
                return;
            }

            let mesh = this.nodeMeshes.get(node.id);
            const fileSize = parseInt(node.metadata?.file_size) || 1;
            const baseSize = Math.log(fileSize + 1) || 1; // Use logarithmic scaling
            const scaledSize = baseSize * this.nodeSizeScalingFactor;
            console.log(`Node ID: ${node.id}, File Size: ${fileSize}, Base Size: ${baseSize}, Scaled Size: ${scaledSize}`);

            if (!mesh) {
                // Create a new mesh for the node
                const geometry = new THREE.SphereGeometry(1, 32, 32); // Use a unit sphere
                const material = new THREE.MeshStandardMaterial({ color: this.nodeColor });
                mesh = new THREE.Mesh(geometry, material);
                this.scene.add(mesh);
                this.nodeMeshes.set(node.id, mesh);

                // Create and add label for the node
                const label = this.createNodeLabel(node.label || node.id);
                this.scene.add(label);
                this.nodeLabels.set(node.id, label);
            }

            // Update mesh position and scale
            mesh.position.set(node.x, node.y, node.z);
            mesh.scale.setScalar(scaledSize);
            mesh.material.color.setHex(this.nodeColor);

            // Update label position
            const label = this.nodeLabels.get(node.id);
            if (label) {
                label.position.set(node.x, node.y + scaledSize + 2, node.z);
            }
        });
    }

    /**
     * Updates or creates edge meshes based on the provided edges data.
     * @param {Array} edges - Array of edge objects.
     */
    updateEdges(edges) {
        console.log(`Updating edges: ${edges.length}`);
        const existingEdgeKeys = new Set(edges.map(edge => `${edge.source}-${edge.target_node}`));

        // Remove meshes for edges that no longer exist
        this.edgeMeshes.forEach((line, edgeKey) => {
            if (!existingEdgeKeys.has(edgeKey)) {
                this.scene.remove(line);
                this.edgeMeshes.delete(edgeKey);
            }
        });

        // Update or create meshes for existing edges
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
                    // Create a new line for the edge
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
                    this.scene.add(line);
                    this.edgeMeshes.set(edgeKey, line);
                } else {
                    console.warn(`Unable to create edge: ${edgeKey}. Source or target node not found.`);
                }
            } else if (sourceMesh && targetMesh) {
                // Update existing line's positions and material
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

        console.log(`Edge color set to: ${this.edgeColor.toString(16)}, opacity: ${this.edgeOpacity}`);
    }

    /**
     * Creates a label for a node using a sprite.
     * @param {String} text - The text to display on the label.
     * @returns {THREE.Sprite} - The sprite containing the label.
     */
    createNodeLabel(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set canvas dimensions based on text
        context.font = `${this.labelFontSize}px Arial`;
        const metrics = context.measureText(text);
        const textWidth = metrics.width;
        const textHeight = this.labelFontSize + 10;
        canvas.width = textWidth + 10;
        canvas.height = textHeight;

        // Draw background rectangle
        context.fillStyle = 'rgba(0, 0, 0, 0.8)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Draw text
        context.font = `${this.labelFontSize}px Arial`;
        context.fillStyle = 'white';
        context.fillText(text, 5, this.labelFontSize);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);

        // Disable depth writing and enable transparency
        spriteMaterial.depthWrite = false;
        spriteMaterial.transparent = true;

        return sprite;
    }

    /**
     * Starts the animation loop, updating controls and rendering the scene.
     */
    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        this.controls.update();

        // Rotate hologram children for animation
        this.hologramGroup.children.forEach(child => {
            child.rotation.x += child.userData.rotationSpeed;
            child.rotation.y += child.userData.rotationSpeed;
        });

        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Handles window resize events to adjust camera and renderer sizes.
     */
    onWindowResize() {
        console.log('Window resized');
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Cleans up resources when disposing of the visualization.
     */
    dispose() {
        console.log('Disposing WebXRVisualization');
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // Dispose all geometries and materials
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

        // Dispose labels
        this.nodeLabels.forEach(label => {
            if (label.material.map) {
                label.material.map.dispose();
            }
            label.material.dispose();
            this.scene.remove(label);
        });

        // Dispose renderer and controls
        this.renderer.dispose();
        if (this.controls) {
            this.controls.dispose();
        }

        // Remove event listener
        window.removeEventListener('resize', this.onWindowResize.bind(this), false);
        console.log('WebXRVisualization disposed');
    }

    /**
     * Updates visual features based on provided changes.
     * @param {Object} changes - An object containing properties to update.
     */
    updateVisualFeatures(changes) {
        console.log('Updating visual features:', changes);
        let needsUpdate = false;
        let layoutChanged = false;

        for (const [name, value] of Object.entries(changes)) {
            if (this.hasOwnProperty(name)) {
                console.log(`Setting property ${name} to`, value);
                this[name] = value;
                needsUpdate = true;

                if (name.includes('forceDirected')) {
                    layoutChanged = true;
                }

                // If node size scaling factor changed, we need to update all nodes
                if (name === 'nodeSizeScalingFactor') {
                    this.updateNodes(this.graphDataManager.getGraphData().nodes);
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

        console.log('Visual features update completed');
    }

    /**
     * Handles input from a spacemouse device to manipulate the camera.
     * @param {Number} x - Translation along the X-axis.
     * @param {Number} y - Translation along the Y-axis.
     * @param {Number} z - Translation along the Z-axis.
     * @param {Number} rx - Rotation around the X-axis.
     * @param {Number} ry - Rotation around the Y-axis.
     * @param {Number} rz - Rotation around the Z-axis.
     */
    handleSpacemouseInput(x, y, z, rx, ry, rz) {
        if (!this.camera || !this.controls) {
            console.warn('Camera or controls not initialized for Spacemouse input');
            return;
        }

        // Translate the camera
        this.camera.position.x += x * WebXRVisualization.TRANSLATION_SPEED;
        this.camera.position.y += y * WebXRVisualization.TRANSLATION_SPEED;
        this.camera.position.z += z * WebXRVisualization.TRANSLATION_SPEED;

        // Rotate the camera
        this.camera.rotation.x += rx * WebXRVisualization.ROTATION_SPEED;
        this.camera.rotation.y += ry * WebXRVisualization.ROTATION_SPEED;
        this.camera.rotation.z += rz * WebXRVisualization.ROTATION_SPEED;

        this.controls.update();
    }

    /**
     * Updates all node labels to ensure they face the camera.
     */
    updateNodeLabels() {
        console.log('Updating node labels');
        const worldPosition = new THREE.Vector3();
        this.camera.getWorldPosition(worldPosition);
        this.nodeLabels.forEach(label => {
            label.lookAt(worldPosition);
        });
        console.log('Node labels update completed');
    }
}
