import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NodeManager } from './nodes.js';
import { EffectsManager } from './effects.js';
import { LayoutManager } from './layout.js';
import { visualizationSettings } from '../../services/visualizationSettings.js';

// Constants for Spacemouse sensitivity
const TRANSLATION_SPEED = 0.01;
const ROTATION_SPEED = 0.01;

export class WebXRVisualization {
    constructor(graphDataManager) {
        console.log('WebXRVisualization constructor called');
        this.graphDataManager = graphDataManager;

        // Initialize the scene, camera, and renderer
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 0, 500);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ReinhardToneMapping;
        this.renderer.setClearColor(0x000000);

        this.controls = null;
        this.animationFrameId = null;

        // Get initial settings
        const settings = visualizationSettings.getSettings();

        // Initialize managers with settings
        this.nodeManager = new NodeManager(this.scene, this.camera, visualizationSettings.getNodeSettings());
        this.effectsManager = new EffectsManager(
            this.scene, 
            this.camera, 
            this.renderer,
            visualizationSettings.getEnvironmentSettings()
        );
        this.layoutManager = new LayoutManager(visualizationSettings.getLayoutSettings());

        // Initialize settings
        this.initializeSettings();

        // Add event listener for graph data updates
        window.addEventListener('graphDataUpdated', (event) => {
            console.log('Received graphDataUpdated event:', event.detail);
            this.updateVisualization();
        });

        // Add event listener for settings updates
        window.addEventListener('visualizationSettingsUpdated', (event) => {
            console.log('Received visualizationSettingsUpdated event:', event.detail);
            this.updateSettings(event.detail);
        });

        console.log('WebXRVisualization constructor completed');
    }

    updateSettings(settings) {
        console.log('Updating settings:', settings);
        if (!settings) return;

        // Update visualization settings
        Object.entries(settings).forEach(([key, value]) => {
            if (typeof value === 'object') {
                // Handle nested settings objects
                Object.entries(value).forEach(([subKey, subValue]) => {
                    const fullKey = `${key}_${subKey}`;
                    this.updateVisualFeatures(fullKey, subValue);
                });
            } else {
                this.updateVisualFeatures(key, value);
            }
        });
    }

    initializeSettings() {
        console.log('Initializing settings');
        this.fogDensity = 0.001; // Reduced fog density
        this.scene.fog = new THREE.FogExp2(0x000000, this.fogDensity);
        
        // Lighting settings
        this.ambientLightIntensity = 50;
        this.directionalLightIntensity = 5.0;
        this.directionalLightColor = 0xffffff;
        this.ambientLightColor = 0x404040;
        
        this.addLights();
        console.log('Settings initialized');
    }

    addLights() {
        console.log('Adding lights to the scene');

        // Create and configure ambient light
        this.ambientLight = new THREE.AmbientLight(this.ambientLightColor, this.ambientLightIntensity);
        this.scene.add(this.ambientLight);

        // Create and configure main directional light
        this.directionalLight = new THREE.DirectionalLight(this.directionalLightColor, this.directionalLightIntensity);
        this.directionalLight.position.set(50, 50, 50);
        this.scene.add(this.directionalLight);

        // Add additional directional lights for better coverage
        const frontLight = new THREE.DirectionalLight(0xffffff, 3.0);
        frontLight.position.set(0, 0, 100);
        this.scene.add(frontLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 3.0);
        backLight.position.set(0, 0, -100);
        this.scene.add(backLight);

        const topLight = new THREE.DirectionalLight(0xffffff, 3.0);
        topLight.position.set(0, 100, 0);
        this.scene.add(topLight);

        // Add point lights for additional illumination
        const pointLight1 = new THREE.PointLight(0xffffff, 2.0, 1000);
        pointLight1.position.set(100, 100, 100);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xffffff, 2.0, 1000);
        pointLight2.position.set(-100, -100, -100);
        this.scene.add(pointLight2);

        console.log('Lights added to the scene');
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

        this.effectsManager.initPostProcessing();
        this.effectsManager.createHologramStructure();

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.animate();
        console.log('Three.js initialization completed');
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        this.controls.update();

        this.effectsManager.animate();
        this.nodeManager.updateLabelOrientations(this.camera);
        this.effectsManager.render();
    }

    onWindowResize() {
        console.log('Window resized');
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.effectsManager.onResize(window.innerWidth, window.innerHeight);
    }

    updateVisualization() {
        console.log('Updating visualization');
        const graphData = this.graphDataManager.getGraphData();
        if (!graphData) {
            console.warn('No graph data available');
            return;
        }

        this.layoutManager.applyForceDirectedLayout(graphData);
        this.nodeManager.updateNodes(graphData.nodes);
        this.nodeManager.updateEdges(graphData.edges);
    }

    updateVisualFeatures(control, value) {
        console.log(`Updating visual feature: ${control} = ${value}`);
        if (!control || typeof control !== 'string') {
            console.warn('Invalid control parameter:', control);
            return;
        }
        
        // Delegate updates to appropriate managers
        if (control.startsWith('node') || control.startsWith('edge')) {
            this.nodeManager.updateFeature(control, value);
        } else if (control.startsWith('bloom') || control.startsWith('hologram')) {
            this.effectsManager.updateFeature(control, value);
        } else if (control.startsWith('forceDirected')) {
            this.layoutManager.updateFeature(control, value);
            this.updateVisualization();
        }

        // Handle lighting and other scene-level features
        switch (control) {
            case 'ambientLightIntensity':
                this.ambientLight.intensity = value;
                break;
            case 'directionalLightIntensity':
                this.directionalLight.intensity = value;
                break;
            case 'ambientLightColor':
                this.ambientLight.color.setHex(value);
                break;
            case 'directionalLightColor':
                this.directionalLight.color.setHex(value);
                break;
            case 'fogDensity':
                this.scene.fog.density = value;
                break;
        }
    }

    handleSpacemouseInput(x, y, z, rx, ry, rz) {
        if (!this.camera || !this.controls) {
            console.warn('Camera or controls not initialized for Spacemouse input');
            return;
        }

        // Apply translation
        this.camera.position.x += x * TRANSLATION_SPEED;
        this.camera.position.y += y * TRANSLATION_SPEED;
        this.camera.position.z += z * TRANSLATION_SPEED;
        
        // Apply rotation
        this.camera.rotation.x += rx * ROTATION_SPEED;
        this.camera.rotation.y += ry * ROTATION_SPEED;
        this.camera.rotation.z += rz * ROTATION_SPEED;

        this.controls.update();
    }

    dispose() {
        console.log('Disposing WebXRVisualization');
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        this.nodeManager.dispose();
        this.effectsManager.dispose();

        this.renderer.dispose();
        if (this.controls) {
            this.controls.dispose();
        }

        console.log('WebXRVisualization disposed');
    }
}
