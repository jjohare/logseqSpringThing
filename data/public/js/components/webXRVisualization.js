import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * WebXRVisualization
 * 
 * This class manages the 3D visualization of a graph using Three.js.
 * It handles the creation and updating of nodes, edges, labels, and a hologram structure.
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
        this.forceDirectedParams = {
            iterations: 100,
            repulsion: 1.0,
            attraction: 0.01,
            damping: 0.85,
            deltaTime: 0.016
        };

        // Materials for temporarily hiding objects during selective rendering
        this.darkMaterial = new THREE.MeshBasicMaterial({ color: 'black' });
        this.materials = {};

        // Initialize settings and Three.js
        this.initializeSettings();
        console.log('WebXRVisualization constructor completed');
    }

    /**
     * Initializes the settings for the visualization.
     * This method sets up default values and calls initThreeJS.
     */
    initializeSettings() {
        console.log('Initializing WebXRVisualization settings');
        // Initialize default settings
        this.nodeColor = 0x1A0B31;
        this.edgeColor = 0xff0000;
        this.hologramColor = 0xFFD700;
        this.nodeSizeScalingFactor = 5;
        this.hologramScale = 5;
        this.hologramOpacity = 0.1;
        this.edgeOpacity = 0.3;
        this.labelFontSize = 36;
        this.fogDensity = 0.002;

        // Initialize Three.js scene
        this.initThreeJS();
    }

    /**
     * Initializes the Three.js scene, including lights, controls, and event listeners.
     */
    initThreeJS() {
        console.log('Initializing Three.js');
        document.body.appendChild(this.renderer.domElement);

        // Set up controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Add fog to the scene
        this.scene.fog = new THREE.FogExp2(0x000000, this.fogDensity);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 0);
        this.scene.add(directionalLight);

        // Add hologram group to the scene
        this.scene.add(this.hologramGroup);

        // Set up event listener for window resize
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        console.log('Three.js initialization complete');
    }

    /**
     * Updates or creates node meshes based on the provided nodes data.
     * @param {Array} nodes - Array of node objects.
     */
    updateNodes(nodes) {
        console.log(`Updating nodes: ${nodes.length}`);
        const existingNodeIds = new Set(nodes.map(node => node.id));

        // Remove meshes for nodes that no longer exist
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

        // Update or create meshes for existing nodes
        nodes.forEach(node => {
            let mesh = this.nodeMeshes.get(node.id);
            if (!mesh) {
                // Create a new sphere for the node
                const geometry = new THREE.SphereGeometry(1, 32, 32);
                const material = new THREE.MeshPhongMaterial({ color: this.nodeColor });
                mesh = new THREE.Mesh(geometry, material);
                this.scene.add(mesh);
                this.nodeMeshes.set(node.id, mesh);

                // Create label for the node
                const label = this.createNodeLabel(node.label);
                this.scene.add(label);
                this.nodeLabels.set(node.id, label);
            }

            // Update node position and scale
            mesh.position.set(node.x, node.y, node.z);
            const scale = Math.sqrt(node.weight || 1) * this.nodeSizeScalingFactor;
            mesh.scale.set(scale, scale, scale);

            // Update label position
            const label = this.nodeLabels.get(node.id);
            if (label) {
                label.position.set(node.x, node.y + scale + 2, node.z);
                label.scale.set(scale * 0.5, scale * 0.5, 1);
            }
        });

        console.log(`Node color set to: ${this.nodeColor.toString(16)}`);
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
     * Updates the visualization based on the current graph data.
     */
    updateVisualization() {
        console.log('Updating visualization');
        if (this.graphDataManager) {
            const { nodes, edges } = this.graphDataManager.getGraphData();
            this.updateNodes(nodes);
            this.updateEdges(edges);
        } else {
            console.error('GraphDataManager not available, cannot update visualization');
        }
    }

    /**
     * Updates visual features of the visualization based on provided settings.
     * @param {Object} settings - Object containing visual settings to update.
     */
    updateVisualFeatures(settings) {
        console.log('Updating visual features:', settings);
        // Update the relevant properties based on the settings
        if (settings.nodeColor !== undefined) {
            this.nodeColor = settings.nodeColor;
            this.nodeMeshes.forEach(mesh => {
                mesh.material.color.setHex(this.nodeColor);
                mesh.material.needsUpdate = true;
            });
        }
        if (settings.edgeColor !== undefined) {
            this.edgeColor = settings.edgeColor;
            this.edgeMeshes.forEach(line => {
                line.material.color.setHex(this.edgeColor);
                line.material.needsUpdate = true;
            });
        }
        if (settings.edgeOpacity !== undefined) {
            this.edgeOpacity = settings.edgeOpacity;
            this.edgeMeshes.forEach(line => {
                line.material.opacity = this.edgeOpacity;
                line.material.needsUpdate = true;
            });
        }
        // Add more visual feature updates as needed
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
}
