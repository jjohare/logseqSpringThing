import * as THREE from 'three';
import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
const logger = createLogger('SceneManager');
export class SceneManager {
    constructor() {
        this.renderer = null;
        this.canvas = null;
        this.animationFrameId = null;
        this.running = false;
        this.renderCallbacks = [];
        this.resizeCallbacks = [];
        this.disposeCallbacks = [];
        this.render = () => {
            if (!this.running || !this.renderer) {
                return;
            }
            // Call all render callbacks
            this.renderCallbacks.forEach(callback => {
                try {
                    callback();
                }
                catch (error) {
                    logger.error('Error in render callback:', createErrorMetadata(error));
                }
            });
            // Render the scene
            this.renderer.render(this.scene, this.camera);
            // Schedule next frame
            this.animationFrameId = requestAnimationFrame(this.render);
        };
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000); // Black background
        // Create camera with default parameters
        this.camera = new THREE.PerspectiveCamera(75, // FOV
        window.innerWidth / window.innerHeight, // Aspect ratio
        0.1, // Near plane
        2000 // Far plane
        );
        this.camera.position.set(0, 10, 50);
        this.camera.lookAt(0, 0, 0);
    }
    static getInstance(canvas) {
        if (!SceneManager.instance) {
            SceneManager.instance = new SceneManager();
        }
        // Initialize renderer if canvas is provided and renderer not created yet
        if (canvas && !SceneManager.instance.renderer) {
            SceneManager.instance.initRenderer(canvas);
        }
        return SceneManager.instance;
    }
    static cleanup() {
        if (SceneManager.instance) {
            SceneManager.instance.dispose();
            SceneManager.instance = null;
        }
    }
    initRenderer(canvas) {
        if (this.renderer) {
            logger.warn('Renderer already initialized');
            return;
        }
        this.canvas = canvas;
        try {
            // Create WebGL renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance'
            });
            // Configure renderer
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit for performance
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            // Set up window resize handler
            this.setupResizeHandler();
            if (debugState.isEnabled()) {
                logger.info('Renderer initialized successfully');
            }
        }
        catch (error) {
            logger.error('Failed to initialize renderer:', createErrorMetadata(error));
            throw error;
        }
    }
    setupResizeHandler() {
        const handleResize = () => {
            if (!this.renderer || !this.canvas)
                return;
            // Update camera
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            // Update renderer
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            // Call resize callbacks
            this.resizeCallbacks.forEach(callback => {
                try {
                    callback();
                }
                catch (error) {
                    logger.error('Error in resize callback:', createErrorMetadata(error));
                }
            });
            if (debugState.isDataDebugEnabled()) {
                logger.debug('Scene resized');
            }
        };
        window.addEventListener('resize', handleResize);
        // Store cleanup function in dispose callbacks
        this.disposeCallbacks.push(() => {
            window.removeEventListener('resize', handleResize);
        });
        // Initial resize
        handleResize();
    }
    handleSettingsUpdate(settings) {
        if (!settings.visualization)
            return;
        // Update renderer settings
        if (this.renderer && settings.visualization.rendering) {
            const renderSettings = settings.visualization.rendering;
            // Update shadow settings
            if (renderSettings.shadows !== undefined) {
                this.renderer.shadowMap.enabled = renderSettings.shadows;
            }
            // Update antialias settings
            if (renderSettings.antialias !== undefined && this.canvas) {
                // Antialias requires recreating the renderer
                const oldRenderer = this.renderer;
                this.renderer = new THREE.WebGLRenderer({
                    canvas: this.canvas,
                    antialias: renderSettings.antialias,
                    alpha: true,
                    powerPreference: 'high-performance'
                });
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                this.renderer.shadowMap.enabled = oldRenderer.shadowMap.enabled;
                this.renderer.shadowMap.type = oldRenderer.shadowMap.type;
                // Dispose old renderer
                oldRenderer.dispose();
            }
            // Update pixel ratio
            if (renderSettings.pixelRatio !== undefined) {
                const ratio = Math.max(1, Math.min(renderSettings.pixelRatio, window.devicePixelRatio));
                this.renderer.setPixelRatio(ratio);
            }
        }
        // Update scene settings
        if (settings.visualization.sceneBackground) {
            this.scene.background = new THREE.Color(settings.visualization.sceneBackground);
        }
        // Update camera settings
        if (settings.visualization.camera) {
            const cameraSettings = settings.visualization.camera;
            if (cameraSettings.fov !== undefined) {
                this.camera.fov = cameraSettings.fov;
            }
            if (cameraSettings.near !== undefined) {
                this.camera.near = cameraSettings.near;
            }
            if (cameraSettings.far !== undefined) {
                this.camera.far = cameraSettings.far;
            }
            if (cameraSettings.position) {
                this.camera.position.set(cameraSettings.position.x, cameraSettings.position.y, cameraSettings.position.z);
            }
            if (cameraSettings.lookAt) {
                this.camera.lookAt(cameraSettings.lookAt.x, cameraSettings.lookAt.y, cameraSettings.lookAt.z);
            }
            this.camera.updateProjectionMatrix();
        }
        if (debugState.isEnabled()) {
            logger.info('Scene settings updated');
        }
    }
    start() {
        if (this.running) {
            logger.warn('Scene manager already running');
            return;
        }
        this.running = true;
        this.render();
        if (debugState.isEnabled()) {
            logger.info('Scene manager started');
        }
    }
    stop() {
        if (!this.running) {
            return;
        }
        this.running = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (debugState.isEnabled()) {
            logger.info('Scene manager stopped');
        }
    }
    addRenderCallback(callback) {
        this.renderCallbacks.push(callback);
        return () => {
            this.renderCallbacks = this.renderCallbacks.filter(cb => cb !== callback);
        };
    }
    addResizeCallback(callback) {
        this.resizeCallbacks.push(callback);
        return () => {
            this.resizeCallbacks = this.resizeCallbacks.filter(cb => cb !== callback);
        };
    }
    dispose() {
        // Stop rendering
        this.stop();
        // Run all dispose callbacks
        this.disposeCallbacks.forEach(callback => {
            try {
                callback();
            }
            catch (error) {
                logger.error('Error in dispose callback:', createErrorMetadata(error));
            }
        });
        // Clear all callbacks
        this.renderCallbacks = [];
        this.resizeCallbacks = [];
        this.disposeCallbacks = [];
        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        // Clear canvas reference
        this.canvas = null;
        if (debugState.isEnabled()) {
            logger.info('Scene manager disposed');
        }
    }
    // Getters
    getScene() {
        return this.scene;
    }
    getCamera() {
        return this.camera;
    }
    getRenderer() {
        return this.renderer;
    }
    isRunning() {
        return this.running;
    }
}
