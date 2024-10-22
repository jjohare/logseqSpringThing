import { Scene, PerspectiveCamera, FogExp2, AmbientLight, DirectionalLight, IcosahedronGeometry, SphereGeometry, MeshBasicMaterial, Mesh, Group, Vector3, Color } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GraphSimulation } from '../graph/graphSimulation.js';
import { NodeManager } from '../graph/nodeManager.js';
import { EdgeManager } from '../graph/edgeManager.js';
import { Hologram } from '../hologram/hologram.js';
import { isGPUAvailable, initGPUCompute, createDataTexture, createEdgeTexture, getPositionShader, getVelocityShader } from '../gpuUtils.js';

export class WebXRVisualization {
    constructor(graphDataManager, renderer, gpuCompute, config) {
        console.log('WebXRVisualization constructor called');
        this.graphDataManager = graphDataManager;
        this.renderer = renderer;
        this.gpuCompute = gpuCompute;
        this.config = config;

        // Initialize Three.js essentials
        this.scene = new Scene();
        this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 0, 500);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Initialize settings from config
        this.initializeSettings();

        // Initialize Managers
        this.nodeManager = new NodeManager(this.scene, null, {
            nodeColor: this.nodeColor,
            nodeSizeScalingFactor: this.nodeSizeScalingFactor,
            maxNodeSize: this.maxNodeSize,
            labelFontSize: this.labelFontSize
        });

        this.edgeManager = new EdgeManager(this.scene, null, {
            edgeOpacity: this.edgeOpacity
        });

        // Check for GPU availability
        this.gpuAvailable = isGPUAvailable(this.renderer);
        console.log(`GPU acceleration ${this.gpuAvailable ? 'is' : 'is not'} available`);

        // Initialize Simulation
        this.simulationMode = this.gpuAvailable ? 'gpu' : 'cpu';
        this.initSimulation();

        // Group for hologram structures
        this.hologramGroup = new Group();
        this.hologram = new Hologram(this.scene, this.hologramColor, this.hologramScale, this.hologramOpacity);

        this.scene.add(this.hologramGroup);

        this.animationFrameId = null;
        this.selectedNode = null;

        this.initThreeJS();
        this.createHologramStructure();

        console.log('WebXRVisualization constructor completed');
    }

    initializeSettings() {
        console.log('Initializing settings');
        try {
            const visualizationConfig = this.config.visualization;
            const bloomConfig = this.config.bloom;

            // Visualization settings
            this.nodeColor = parseInt(visualizationConfig.node_color, 16);
            this.edgeColor = parseInt(visualizationConfig.edge_color, 16);
            this.hologramColor = parseInt(visualizationConfig.hologram_color, 16);
            this.nodeSizeScalingFactor = visualizationConfig.node_size_scaling_factor;
            this.hologramScale = visualizationConfig.hologram_scale;
            this.hologramOpacity = visualizationConfig.hologram_opacity;
            this.edgeOpacity = visualizationConfig.edge_opacity;
            this.labelFontSize = visualizationConfig.label_font_size;
            this.fogDensity = visualizationConfig.fog_density;

            // Force-directed layout parameters
            this.forceDirectedIterations = visualizationConfig.force_directed_iterations;
            this.forceDirectedRepulsion = visualizationConfig.force_directed_repulsion;
            this.forceDirectedAttraction = visualizationConfig.force_directed_attraction;

            // Bloom settings
            this.nodeBloomStrength = bloomConfig.node_bloom_strength;
            this.nodeBloomRadius = bloomConfig.node_bloom_radius;
            this.nodeBloomThreshold = bloomConfig.node_bloom_threshold;
            this.edgeBloomStrength = bloomConfig.edge_bloom_strength;
            this.edgeBloomRadius = bloomConfig.edge_bloom_radius;
            this.edgeBloomThreshold = bloomConfig.edge_bloom_threshold;
            this.environmentBloomStrength = bloomConfig.environment_bloom_strength;
            this.environmentBloomRadius = bloomConfig.environment_bloom_radius;
            this.environmentBloomThreshold = bloomConfig.environment_bloom_threshold;

            // Other settings
            this.damping = 0.85;
            this.recentChangeColor = new Color(0x00ff00);
            this.oldChangeColor = new Color(0xff0000);
            this.minNodeSize = 1;
            this.maxNodeSize = 20;
            this.maxChangeDays = 30;

            console.log('Settings initialized');
        } catch (error) {
            console.error('Error initializing settings:', error);
            throw new Error('Failed to initialize settings');
        }
    }

    initSimulation() {
        const nodes = this.graphDataManager.getNodes();
        const edges = this.graphDataManager.getEdges();

        try {
            if (this.simulationMode !== 'remote') {
                this.simulation = new GraphSimulation(this.renderer, nodes, edges, this.simulationMode);
                console.log(`Simulation initialized in ${this.simulationMode} mode`);
            } else {
                console.log('Remote simulation mode: No local simulation initialized');
            }
        } catch (error) {
            console.error('Error initializing simulation:', error);
            this.simulationMode = 'cpu';
            this.simulation = new GraphSimulation(this.renderer, nodes, edges, 'cpu');
            console.log('Fallback to CPU simulation mode');
        }

        // Connect Managers with Simulation
        this.edgeManager.setGraphSimulation(this.simulation);
        this.nodeManager.setGraphSimulation(this.simulation);

        // Set initial simulation parameters
        this.updateForceDirectedParams();
    }

    initThreeJS() {
        console.log('Initializing Three.js');
        const container = document.getElementById('scene-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        } else {
            console.error("Could not find 'scene-container' element");
            throw new Error("Could not find 'scene-container' element");
        }

        // Add exponential fog to the scene
        this.scene.fog = new FogExp2(0x000000, this.fogDensity);

        // Add lighting to the scene
        this.addLights();

        // Add event listener for window resize
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Start the animation loop
        this.animate();
        console.log('Three.js initialization completed');
    }

    addLights() {
        console.log('Adding lights to the scene');
        const ambientLight = new AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 50, 50);
        this.scene.add(directionalLight);
        console.log('Lights added to the scene');
    }

    createHologramStructure() {
        console.log('Creating hologram structure');
        this.hologramGroup.clear();

        try {
            // Icosahedron for hologram
            const buckyGeometry = new IcosahedronGeometry(40 * this.hologramScale, 1);
            const buckyMaterial = new MeshBasicMaterial({
                color: this.hologramColor,
                wireframe: true,
                transparent: true,
                opacity: this.hologramOpacity
            });
            const buckySphere = new Mesh(buckyGeometry, buckyMaterial);
            buckySphere.userData.rotationSpeed = 0.0001;
            this.hologramGroup.add(buckySphere);

            // Geodesic dome
            const geodesicGeometry = new IcosahedronGeometry(10 * this.hologramScale, 1);
            const geodesicMaterial = new MeshBasicMaterial({
                color: this.hologramColor,
                wireframe: true,
                transparent: true,
                opacity: this.hologramOpacity
            });
            const geodesicDome = new Mesh(geodesicGeometry, geodesicMaterial);
            geodesicDome.userData.rotationSpeed = 0.0002;
            this.hologramGroup.add(geodesicDome);

            // Sphere for hologram
            const triangleGeometry = new SphereGeometry(100 * this.hologramScale, 32, 32);
            const triangleMaterial = new MeshBasicMaterial({
                color: this.hologramColor,
                wireframe: true,
                transparent: true,
                opacity: this.hologramOpacity
            });
            const triangleSphere = new Mesh(triangleGeometry, triangleMaterial);
            triangleSphere.userData.rotationSpeed = 0.0003;
            this.hologramGroup.add(triangleSphere);

            this.scene.add(this.hologramGroup);
            console.log('Hologram structure created');
        } catch (error) {
            console.error('Error creating hologram structure:', error);
            throw new Error('Failed to create hologram structure');
        }
    }

    updateVisualization() {
        console.log('Updating visualization');
        const graphData = this.graphDataManager.getGraphData();
        if (!graphData) {
            console.warn('No graph data available for visualization update');
            return;
        }
        console.log('Graph data received:', graphData);

        try {
            if (this.simulationMode === 'remote') {
                // For remote simulation, we directly update node positions from the server data
                this.nodeManager.updateNodesPositions(graphData.nodes);
            } else {
                // For local simulation (CPU or GPU), we compute the simulation step
                this.simulation.compute(0.016); // Assuming ~60fps, deltaTime ~16ms
            }

            this.nodeManager.updateNodes(this.graphDataManager.getNodes());
            this.edgeManager.updateEdges(this.graphDataManager.getEdges());
            console.log('Visualization update completed');
        } catch (error) {
            console.error('Error updating visualization:', error);
            throw new Error('Failed to update visualization');
        }
    }

    animate() {
        try {
            this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
            this.controls.update();

            // Rotate hologram children for animation
            this.hologramGroup.children.forEach(child => {
                child.rotation.x += child.userData.rotationSpeed;
                child.rotation.y += child.userData.rotationSpeed;
            });

            // Update node labels to face the camera
            this.updateNodeLabels();

            // Render the scene
            this.renderer.render(this.scene, this.camera);
        } catch (error) {
            console.error('Error in animation loop:', error);
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    onWindowResize() {
        console.log('Window resized');
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateVisualFeatures(changes) {
        console.log('Updating visual features:', changes);
        let needsUpdate = false;
        let layoutChanged = false;

        const updateHandlers = {
            nodeColor: (value) => this.nodeManager.setNodeColor(value),
            edgeColor: (value) => this.edgeManager.setEdgeColor(value),
            hologramColor: (value) => this.hologram.updateColor(value),
            hologramScale: (value) => this.hologramGroup.scale.set(value, value, value),
            hologramOpacity: (value) => this.hologram.updateOpacity(value),
            edgeOpacity: (value) => this.edgeManager.setEdgeOpacity(value),
            nodeSizeScalingFactor: () => this.nodeManager.updateNodes(this.graphDataManager.getNodes()),
            labelFontSize: (value) => this.nodeManager.updateLabelFontSize(value),
            fogDensity: (value) => {
                if (this.scene.fog instanceof FogExp2) {
                    this.scene.fog.density = value;
                }
            }
        };

        try {
            for (const [name, value] of Object.entries(changes)) {
                if (this.hasOwnProperty(name)) {
                    console.log(`Setting property ${name} to`, value);
                    this[name] = value;
                    needsUpdate = true;

                    if (name.includes('forceDirected')) {
                        layoutChanged = true;
                    }

                    if (updateHandlers[name]) {
                        updateHandlers[name](value);
                    }

                    // Handle bloom settings
                    if (name.includes('Bloom')) {
                        // Update bloom effect (implementation depends on how bloom is set up)
                        console.log(`Updating bloom setting: ${name}`);
                    }
                } else {
                    console.warn(`Property ${name} does not exist on WebXRVisualization`);
                }
            }

            if (needsUpdate) {
                if (layoutChanged) {
                    this.updateForceDirectedParams();
                }
                this.updateVisualization();
            }

            console.log('Visual features update completed');
        } catch (error) {
            console.error('Error updating visual features:', error);
            throw new Error('Failed to update visual features');
        }
    }

    updateForceDirectedParams() {
        if (this.simulation) {
            try {
                this.simulation.setSimulationParameters({
                    iterations: this.forceDirectedIterations,
                    repulsion: this.forceDirectedRepulsion,
                    attraction: this.forceDirectedAttraction,
                    damping: this.damping
                });
            } catch (error) {
                console.error('Error updating force-directed parameters:', error);
                throw new Error('Failed to update force-directed parameters');
            }
        }
    }

    handleSpacemouseInput(x, y, z, rx, ry, rz) {
        if (!this.camera || !this.controls) {
            console.warn('Camera or controls not initialized for Spacemouse input');
            return;
        }

        try {
            // Translate the camera
            this.camera.position.x += x * WebXRVisualization.TRANSLATION_SPEED;
            this.camera.position.y += y * WebXRVisualization.TRANSLATION_SPEED;
            this.camera.position.z += z * WebXRVisualization.TRANSLATION_SPEED;

            // Rotate the camera
            this.camera.rotation.x += rx * WebXRVisualization.ROTATION_SPEED;
            this.camera.rotation.y += ry * WebXRVisualization.ROTATION_SPEED;
            this.camera.rotation.z += rz * WebXRVisualization.ROTATION_SPEED;

            this.controls.update();
        } catch (error) {
            console.error('Error handling Spacemouse input:', error);
        }
    }

    updateNodeLabels() {
        console.log('Updating node labels');
        try {
            const worldPosition = new Vector3();
            this.camera.getWorldPosition(worldPosition);
            this.nodeManager.updateLabels(worldPosition);
            console.log('Node labels update completed');
        } catch (error) {
            console.error('Error updating node labels:', error);
        }
    }

    switchSimulationMode(mode) {
        console.log(`Switching simulation mode to: ${mode}`);
        if (mode === 'gpu' && !this.gpuAvailable) {
            console.warn('GPU acceleration is not available. Falling back to CPU mode.');
            mode = 'cpu';
        }

        try {
            if (this.simulationMode !== mode) {
                this.simulationMode = mode;
                if (mode === 'remote') {
                    // For remote mode, we don't need to initialize a local simulation
                    this.simulation = null;
                } else {
                    this.initSimulation();
                }
                this.updateForceDirectedParams();
                this.updateVisualization();
            }

            console.log(`Simulation mode switched to ${this.simulationMode}`);
        } catch (error) {
            console.error('Error switching simulation mode:', error);
            throw new Error('Failed to switch simulation mode');
        }
    }

    dispose() {
        console.log('Disposing WebXRVisualization');
        try {
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
            this.nodeManager.dispose();
            this.edgeManager.dispose();

            // Dispose hologram
            this.hologram.dispose();

            // Dispose simulation
            if (this.simulation) {
                this.simulation.dispose();
            }

            // Dispose renderer and controls
            this.renderer.dispose();
            if (this.controls) {
                this.controls.dispose();
            }

            // Remove event listener
            window.removeEventListener('resize', this.onWindowResize.bind(this), false);
            console.log('WebXRVisualization disposed');
        } catch (error) {
            console.error('Error disposing WebXRVisualization:', error);
        }
    }
}

// Define static properties
WebXRVisualization.TRANSLATION_SPEED = 0.1;
WebXRVisualization.ROTATION_SPEED = 0.01;
