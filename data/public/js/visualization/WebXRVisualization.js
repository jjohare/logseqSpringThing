import { Scene, PerspectiveCamera, FogExp2, AmbientLight, DirectionalLight, IcosahedronGeometry, SphereGeometry, MeshBasicMaterial, Mesh, Group, Vector3, Color } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GraphSimulation } from '../graph/graphSimulation.js';
import { NodeManager } from '../graph/nodeManager.js';
import { EdgeManager } from '../graph/edgeManager.js';
import { Hologram } from '../hologram/hologram.js';

export class WebXRVisualization {
    constructor(graphDataManager, renderer) {
        console.log('WebXRVisualization constructor called');
        this.graphDataManager = graphDataManager;
        this.renderer = renderer;

        // Initialize Three.js essentials
        this.scene = new Scene();
        this.camera = new PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        this.camera.position.set(0, 0, 500);
        this.camera.lookAt(0, 0, 0); // Ensure the camera looks at the origin

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Initialize Managers
        this.nodeManager = new NodeManager(this.scene, null, {
            nodeColor: 0x1A0B31,
            nodeSizeScalingFactor: 0.4,
            maxNodeSize: 20,
            labelFontSize: 20
        });

        this.edgeManager = new EdgeManager(this.scene, null, {
            edgeOpacity: 0.3
        });

        // Initialize Simulation
        this.simulation = new GraphSimulation(this.renderer, this.graphDataManager.getNodes(), this.graphDataManager.getEdges());

        // Connect Managers with Simulation
        this.edgeManager.setGraphSimulation(this.simulation);
        this.nodeManager.setGraphSimulation(this.simulation);

        // Group for hologram structures
        this.hologramGroup = new Group();
        this.hologram = new Hologram(this.scene, 0xFFD700, 1, 0.1);

        this.scene.add(this.hologramGroup);

        this.animationFrameId = null;
        this.selectedNode = null;

        // Force-directed layout parameters
        this.minNodeSize = 1;
        this.maxNodeSize = 20;
        this.nodeSizeScalingFactor = 0.4;
        this.recentChangeColor = new Color(0x00ff00); // Green for recent changes
        this.oldChangeColor = new Color(0xff0000); // Red for old changes
        this.maxChangeDays = 30; // Consider changes older than 30 days as "old"

        // Initialize settings and Three.js
        this.initializeSettings();
        this.initThreeJS();
        console.log('WebXRVisualization constructor completed');
    }

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

        // Add exponential fog to the scene
        this.scene.fog = new FogExp2(0x000000, this.fogDensity);

        // Add lighting to the scene
        this.addLights();

        // Create hologram structures
        this.createHologramStructure();

        // Add event listener for window resize
        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        // Start the animation loop
        this.animate = this.animate.bind(this);
        this.animate();
        console.log('Three.js initialization completed');
    }

    addLights() {
        console.log('Adding lights to the scene');
        const ambientLight = new AmbientLight(0x404040, 1.5); // Soft white light
        this.scene.add(ambientLight);

        const directionalLight = new DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 50, 50);
        this.scene.add(directionalLight);
        console.log('Lights added to the scene');
    }

    createHologramStructure() {
        console.log('Creating hologram structure');
        this.hologramGroup.clear();

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
    }

    updateVisualization() {
        console.log('Updating visualization');
        if (!this.graphDataManager) {
            console.warn('GraphDataManager is not available');
            return;
        }
        const graphData = this.graphDataManager.getGraphData();
        if (!graphData) {
            console.warn('No graph data available for visualization update');
            return;
        }
        console.log('Graph data received:', graphData);

        if (this.useLocalForceCalculation) {
            this.simulation.compute(0.016); // Assuming ~60fps, deltaTime ~16ms
        } else {
            // Use the positions directly from the server
            this.simulation.updatePositionsFromServer(graphData.nodes);
        }
        this.nodeManager.updateNodes(this.graphDataManager.getNodes());
        this.edgeManager.updateEdges(this.graphDataManager.getEdges());
        console.log('Visualization update completed');
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate);
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
    }

    onWindowResize() {
        console.log('Window resized');
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

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
    }

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

                // If node size scaling factor changed, update all nodes
                if (name === 'nodeSizeScalingFactor') {
                    this.nodeManager.updateNodes(this.graphDataManager.getNodes());
                }

                // Handle other visual feature changes
                if (name === 'nodeColor') {
                    this.nodeManager.setNodeColor(value);
                }
                if (name === 'edgeColor') {
                    this.edgeManager.setEdgeColor(value);
                }
                if (name === 'hologramColor') {
                    this.hologram.updateColor(value);
                }
                if (name === 'hologramScale') {
                    this.hologramGroup.scale.set(value, value, value);
                }
                if (name === 'hologramOpacity') {
                    this.hologram.updateOpacity(value);
                }
                if (name === 'edgeOpacity') {
                    this.edgeManager.setEdgeOpacity(value);
                }
            } else {
                console.warn(`Property ${name} does not exist on WebXRVisualization`);
            }
        }

        if (needsUpdate) {
            if (layoutChanged) {
                this.updateVisualization();
                // Potentially re-initialize simulation parameters
                if (this.simulation) {
                    this.simulation.setSimulationParameters({
                        iterations: this.forceDirectedIterations,
                        repulsion: this.forceDirectedRepulsion,
                        attraction: this.forceDirectedAttraction,
                        damping: this.damping
                    });
                }
            } else {
                this.updateNodes(this.graphDataManager.getNodes());
                this.updateEdges(this.graphDataManager.getEdges());
            }

            console.log('Visual features update completed');
        }
    }

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

    updateNodeLabels() {
        console.log('Updating node labels');
        const worldPosition = new Vector3();
        this.camera.getWorldPosition(worldPosition);
        this.nodeManager.updateLabels(worldPosition);
        console.log('Node labels update completed');
    }

    switchSimulationMode(mode) {
        if (this.simulation) {
            this.simulation.dispose();
        }
        this.useLocalForceCalculation = mode === 'local';
        this.simulation = new GraphSimulation(this.renderer, this.graphDataManager.getNodes(), this.graphDataManager.getEdges(), this.useLocalForceCalculation ? 'cpu' : 'remote');
        this.edgeManager.setGraphSimulation(this.simulation);
        this.nodeManager.setGraphSimulation(this.simulation);
        console.log(`Switched simulation mode to ${mode}`);
    }
}

// Define static properties
WebXRVisualization.TRANSLATION_SPEED = 0.1;
WebXRVisualization.ROTATION_SPEED = 0.01;
