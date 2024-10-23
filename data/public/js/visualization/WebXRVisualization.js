import { Scene, PerspectiveCamera, FogExp2, AmbientLight, DirectionalLight, IcosahedronGeometry, SphereGeometry, MeshBasicMaterial, Mesh, Group, Vector3, Color } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GraphSimulation } from '../graph/graphSimulation.js';
import { NodeManager } from '../graph/nodeManager.js';
import { EdgeManager } from '../graph/edgeManager.js';
import { Hologram } from '../hologram/hologram.js';
import { isGPUAvailable, initGPUCompute } from '../gpuUtils.js';

export class WebXRVisualization {
    constructor(graphDataManager, renderer, gpuCompute, config) {
        if (!graphDataManager || !renderer) {
            throw new Error('Required parameters missing in WebXRVisualization constructor');
        }

        this.graphDataManager = graphDataManager;
        this.renderer = renderer;
        this.gpuCompute = gpuCompute;
        this.config = config || {};

        try {
            this.initializeScene();
            this.initializeSettings();
            this.initializeManagers();
            this.setupGPU();
            this.initSimulation();
            this.setupHologram();
            this.initThreeJS();
            
            // Start animation loop only after successful initialization
            this.animate();
        } catch (error) {
            console.error('Error initializing WebXRVisualization:', error);
            throw error;
        }
    }

    initializeScene() {
        // Initialize Three.js scene
        this.scene = new Scene();
        
        // Initialize camera with default settings
        this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 0, 500);
        this.camera.lookAt(0, 0, 0);

        // Initialize orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
    }

    initializeSettings() {
        try {
            const visualizationConfig = this.config.visualization || {};
            const bloomConfig = this.config.bloom || {};

            // Visualization settings with fallbacks
            this.nodeColor = parseInt(visualizationConfig.node_color || '0x0088ff', 16);
            this.edgeColor = parseInt(visualizationConfig.edge_color || '0x888888', 16);
            this.hologramColor = parseInt(visualizationConfig.hologram_color || '0x00ff88', 16);
            this.nodeSizeScalingFactor = visualizationConfig.node_size_scaling_factor || 1.0;
            this.hologramScale = visualizationConfig.hologram_scale || 1.0;
            this.hologramOpacity = visualizationConfig.hologram_opacity || 0.5;
            this.edgeOpacity = visualizationConfig.edge_opacity || 0.5;
            this.labelFontSize = visualizationConfig.label_font_size || 12;
            this.fogDensity = visualizationConfig.fog_density || 0.001;

            // Force-directed layout parameters
            this.forceDirectedIterations = visualizationConfig.force_directed_iterations || 100;
            this.forceDirectedRepulsion = visualizationConfig.force_directed_repulsion || 1.0;
            this.forceDirectedAttraction = visualizationConfig.force_directed_attraction || 0.01;

            // Bloom settings
            this.nodeBloomStrength = bloomConfig.node_bloom_strength || 1.0;
            this.nodeBloomRadius = bloomConfig.node_bloom_radius || 0.5;
            this.nodeBloomThreshold = bloomConfig.node_bloom_threshold || 0.5;
            this.edgeBloomStrength = bloomConfig.edge_bloom_strength || 0.5;
            this.edgeBloomRadius = bloomConfig.edge_bloom_radius || 0.5;
            this.edgeBloomThreshold = bloomConfig.edge_bloom_threshold || 0.5;
            this.environmentBloomStrength = bloomConfig.environment_bloom_strength || 0.3;
            this.environmentBloomRadius = bloomConfig.environment_bloom_radius || 0.5;
            this.environmentBloomThreshold = bloomConfig.environment_bloom_threshold || 0.5;

            // Other settings
            this.damping = 0.85;
            this.recentChangeColor = new Color(0x00ff00);
            this.oldChangeColor = new Color(0xff0000);
            this.minNodeSize = 1;
            this.maxNodeSize = 20;
            this.maxChangeDays = 30;
        } catch (error) {
            console.error('Error initializing settings:', error);
            throw new Error('Failed to initialize settings');
        }
    }

    initializeManagers() {
        try {
            this.nodeManager = new NodeManager(this.scene, null, {
                nodeColor: this.nodeColor,
                nodeSizeScalingFactor: this.nodeSizeScalingFactor,
                maxNodeSize: this.maxNodeSize,
                labelFontSize: this.labelFontSize
            });

            this.edgeManager = new EdgeManager(this.scene, null, {
                edgeOpacity: this.edgeOpacity
            });
        } catch (error) {
            console.error('Error initializing managers:', error);
            throw new Error('Failed to initialize managers');
        }
    }

    setupGPU() {
        try {
            // Check GPU availability
            this.gpuAvailable = this.gpuCompute !== null && isGPUAvailable(this.renderer);
            
            if (!this.gpuAvailable) {
                console.warn('GPU acceleration is not available');
                this.simulationMode = 'cpu';
            } else {
                console.log('GPU acceleration is available');
                this.simulationMode = 'gpu';
            }
        } catch (error) {
            console.error('Error setting up GPU:', error);
            this.gpuAvailable = false;
            this.simulationMode = 'cpu';
        }
    }

    initSimulation() {
        try {
            const nodes = this.graphDataManager.getNodes();
            const edges = this.graphDataManager.getEdges();

            if (this.simulationMode !== 'remote') {
                this.simulation = new GraphSimulation(this.renderer, nodes, edges, this.simulationMode);
                
                // Connect Managers with Simulation
                this.edgeManager.setGraphSimulation(this.simulation);
                this.nodeManager.setGraphSimulation(this.simulation);

                // Set initial simulation parameters
                this.updateForceDirectedParams();
            } else {
                this.simulation = null;
            }
        } catch (error) {
            console.error('Error initializing simulation:', error);
            throw new Error('Failed to initialize simulation');
        }
    }

    setupHologram() {
        try {
            // Group for hologram structures
            this.hologramGroup = new Group();
            this.hologram = new Hologram(
                this.scene,
                this.hologramColor,
                this.hologramScale,
                this.hologramOpacity
            );

            this.scene.add(this.hologramGroup);
            this.createHologramStructure();
        } catch (error) {
            console.error('Error setting up hologram:', error);
            throw new Error('Failed to setup hologram');
        }
    }

    initThreeJS() {
        try {
            const container = document.getElementById('scene-container');
            if (!container) {
                throw new Error("Could not find 'scene-container' element");
            }

            // Set renderer size and append to container
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            container.appendChild(this.renderer.domElement);

            // Add exponential fog to the scene
            this.scene.fog = new FogExp2(0x000000, this.fogDensity);

            // Add lighting to the scene
            this.addLights();

            // Add event listener for window resize
            window.addEventListener('resize', this.onWindowResize.bind(this), false);
        } catch (error) {
            console.error('Error initializing Three.js:', error);
            throw new Error('Failed to initialize Three.js');
        }
    }

    addLights() {
        const ambientLight = new AmbientLight(0x404040, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 50, 50);
        this.scene.add(directionalLight);
    }

    createHologramStructure() {
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
        } catch (error) {
            console.error('Error creating hologram structure:', error);
            throw new Error('Failed to create hologram structure');
        }
    }

    updateVisualization() {
        const graphData = this.graphDataManager.getGraphData();
        if (!graphData || !graphData.nodes || !graphData.edges) {
            console.warn('No valid graph data available for visualization update');
            return;
        }

        try {
            if (this.simulationMode === 'remote') {
                // For remote simulation, directly update node positions from the server data
                this.nodeManager.updateNodesPositions(graphData.nodes);
            } else if (this.simulation) {
                // For local simulation (CPU or GPU), compute the simulation step
                this.simulation.compute(0.016); // Assuming ~60fps, deltaTime ~16ms
            }

            this.nodeManager.updateNodes(graphData.nodes);
            this.edgeManager.updateEdges(graphData.edges);
        } catch (error) {
            console.error('Error updating visualization:', error);
        }
    }

    animate() {
        try {
            this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
            
            // Update controls
            if (this.controls) {
                this.controls.update();
            }

            // Rotate hologram children for animation
            if (this.hologramGroup) {
                this.hologramGroup.children.forEach(child => {
                    if (child.userData.rotationSpeed) {
                        child.rotation.x += child.userData.rotationSpeed;
                        child.rotation.y += child.userData.rotationSpeed;
                    }
                });
            }

            // Update node labels to face the camera
            this.updateNodeLabels();

            // Render the scene
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        } catch (error) {
            console.error('Error in animation loop:', error);
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    updateVisualFeatures(changes) {
        if (!changes || typeof changes !== 'object') {
            console.warn('Invalid changes object provided to updateVisualFeatures');
            return;
        }

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
                    this[name] = value;
                    needsUpdate = true;

                    if (name.includes('forceDirected')) {
                        layoutChanged = true;
                    }

                    if (updateHandlers[name]) {
                        updateHandlers[name](value);
                    }
                }
            }

            if (needsUpdate) {
                if (layoutChanged) {
                    this.updateForceDirectedParams();
                }
                this.updateVisualization();
            }
        } catch (error) {
            console.error('Error updating visual features:', error);
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
            }
        }
    }

    handleSpacemouseInput(x, y, z, rx, ry, rz) {
        if (!this.camera || !this.controls) {
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
        try {
            const worldPosition = new Vector3();
            this.camera.getWorldPosition(worldPosition);
            this.nodeManager.updateLabels(worldPosition);
        } catch (error) {
            console.error('Error updating node labels:', error);
        }
    }

    switchSimulationMode(mode) {
        if (mode === 'gpu' && !this.gpuAvailable) {
            console.warn('GPU acceleration is not available. Falling back to CPU mode.');
            mode = 'cpu';
        }

        try {
            if (this.simulationMode !== mode) {
                this.simulationMode = mode;
                if (mode === 'remote') {
                    this.simulation = null;
                } else {
                    this.initSimulation();
                }
                this.updateForceDirectedParams();
                this.updateVisualization();
            }
        } catch (error) {
            console.error('Error switching simulation mode:', error);
            throw new Error('Failed to switch simulation mode');
        }
    }

    dispose() {
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

            // Dispose managers
            if (this.nodeManager) this.nodeManager.dispose();
            if (this.edgeManager) this.edgeManager.dispose();
            if (this.hologram) this.hologram.dispose();
            if (this.simulation) this.simulation.dispose();

            // Dispose controls
            if (this.controls) {
                this.controls.dispose();
            }

            // Remove event listener
            window.removeEventListener('resize', this.onWindowResize.bind(this), false);
        } catch (error) {
            console.error('Error disposing WebXRVisualization:', error);
        }
    }
}

// Define static properties
WebXRVisualization.TRANSLATION_SPEED = 0.1;
WebXRVisualization.ROTATION_SPEED = 0.01;
