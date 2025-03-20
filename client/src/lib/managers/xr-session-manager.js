import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
const logger = createLogger('XRSessionManager');
export class XRSessionManager {
    constructor(sceneManager) {
        this.renderer = null;
        this.camera = null;
        this.scene = null;
        this.controllers = [];
        this.controllerGrips = [];
        this.controllerModelFactory = null;
        this.vrButton = null;
        this.sessionActive = false;
        this.settings = null;
        // Event handlers
        this.selectStartHandlers = [];
        this.selectEndHandlers = [];
        this.squeezeStartHandlers = [];
        this.squeezeEndHandlers = [];
        // New event handlers for hand interactions
        this.gestureRecognizedHandlers = [];
        this.handsVisibilityChangedHandlers = [];
        this.handTrackingStateHandlers = [];
        this.sceneManager = sceneManager;
        this.renderer = sceneManager.getRenderer();
        this.camera = sceneManager.getCamera();
        this.scene = sceneManager.getScene();
        if (!this.renderer) {
            throw new Error('XRSessionManager requires a renderer from SceneManager');
        }
        // Initialize controller model factory
        this.controllerModelFactory = new XRControllerModelFactory();
    }
    static getInstance(sceneManager) {
        if (!XRSessionManager.instance) {
            XRSessionManager.instance = new XRSessionManager(sceneManager);
        }
        return XRSessionManager.instance;
    }
    initialize(settings) {
        if (!this.renderer || !this.scene) {
            logger.error('Cannot initialize XR: renderer or scene is missing');
            return;
        }
        this.settings = settings;
        try {
            // Check if WebXR is supported
            if ('xr' in navigator) {
                // Set up renderer for XR
                this.renderer.xr.enabled = true;
                // Set reference space type based on settings
                this.renderer.xr.setReferenceSpaceType(settings.xr?.roomScale ? 'local-floor' : 'local');
                // Create VR button
                this.createVRButton();
                // Create controllers
                this.setupControllers();
                if (debugState.isEnabled()) {
                    logger.info('XR session manager initialized successfully');
                }
            }
            else {
                logger.warn('WebXR not supported in this browser');
            }
        }
        catch (error) {
            logger.error('Failed to initialize XR:', createErrorMetadata(error));
        }
    }
    createVRButton() {
        if (!this.renderer)
            return;
        try {
            // Create VR button and add to document
            this.vrButton = VRButton.createButton(this.renderer);
            // Style the button
            this.vrButton.style.position = 'absolute';
            this.vrButton.style.bottom = '20px';
            this.vrButton.style.right = '20px';
            this.vrButton.style.zIndex = '100';
            // Add button to document
            document.body.appendChild(this.vrButton);
            // Add session start/end listeners
            this.renderer.xr.addEventListener('sessionstart', () => {
                this.sessionActive = true;
                if (debugState.isEnabled()) {
                    logger.info('XR session started');
                }
            });
            this.renderer.xr.addEventListener('sessionend', () => {
                this.sessionActive = false;
                if (debugState.isEnabled()) {
                    logger.info('XR session ended');
                }
            });
        }
        catch (error) {
            logger.error('Failed to create VR button:', createErrorMetadata(error));
        }
    }
    setupControllers() {
        if (!this.renderer || !this.scene)
            return;
        try {
            // Create controllers
            for (let i = 0; i < 2; i++) {
                // Controller
                const controller = this.renderer.xr.getController(i);
                controller.addEventListener('selectstart', (event) => this.handleSelectStart(event, i));
                controller.addEventListener('selectend', (event) => this.handleSelectEnd(event, i));
                controller.addEventListener('squeezestart', (event) => this.handleSqueezeStart(event, i));
                controller.addEventListener('squeezeend', (event) => this.handleSqueezeEnd(event, i));
                controller.addEventListener('connected', (event) => {
                    if (debugState.isEnabled()) {
                        logger.info(`Controller ${i} connected:`, {
                            handedness: event.data?.handedness,
                            targetRayMode: event.data?.targetRayMode
                        });
                    }
                });
                controller.addEventListener('disconnected', () => {
                    if (debugState.isEnabled()) {
                        logger.info(`Controller ${i} disconnected`);
                    }
                });
                this.scene.add(controller);
                this.controllers.push(controller);
                // Controller grip
                const controllerGrip = this.renderer.xr.getControllerGrip(i);
                if (this.controllerModelFactory) {
                    controllerGrip.add(this.controllerModelFactory.createControllerModel(controllerGrip));
                }
                this.scene.add(controllerGrip);
                this.controllerGrips.push(controllerGrip);
                // Add visual indicators for the controllers
                const geometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, -1)
                ]);
                const line = new THREE.Line(geometry);
                line.name = 'controller-line';
                line.scale.z = 5;
                controller.add(line);
                controller.userData.selectPressed = false;
                controller.userData.squeezePressed = false;
            }
            if (debugState.isEnabled()) {
                logger.info('XR controllers set up successfully');
            }
        }
        catch (error) {
            logger.error('Failed to set up XR controllers:', createErrorMetadata(error));
        }
    }
    // Event handlers
    handleSelectStart(event, controllerId) {
        if (controllerId >= this.controllers.length)
            return;
        const controller = this.controllers[controllerId];
        controller.userData.selectPressed = true;
        const inputSource = event.data;
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Controller ${controllerId} select start`);
        }
        this.selectStartHandlers.forEach(handler => {
            try {
                handler({ controller, inputSource, data: event.data });
            }
            catch (error) {
                logger.error('Error in selectStart handler:', createErrorMetadata(error));
            }
        });
    }
    handleSelectEnd(event, controllerId) {
        if (controllerId >= this.controllers.length)
            return;
        const controller = this.controllers[controllerId];
        controller.userData.selectPressed = false;
        const inputSource = event.data;
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Controller ${controllerId} select end`);
        }
        this.selectEndHandlers.forEach(handler => {
            try {
                handler({ controller, inputSource, data: event.data });
            }
            catch (error) {
                logger.error('Error in selectEnd handler:', createErrorMetadata(error));
            }
        });
    }
    handleSqueezeStart(event, controllerId) {
        if (controllerId >= this.controllers.length)
            return;
        const controller = this.controllers[controllerId];
        controller.userData.squeezePressed = true;
        const inputSource = event.data;
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Controller ${controllerId} squeeze start`);
        }
        this.squeezeStartHandlers.forEach(handler => {
            try {
                handler({ controller, inputSource, data: event.data });
            }
            catch (error) {
                logger.error('Error in squeezeStart handler:', createErrorMetadata(error));
            }
        });
    }
    handleSqueezeEnd(event, controllerId) {
        if (controllerId >= this.controllers.length)
            return;
        const controller = this.controllers[controllerId];
        controller.userData.squeezePressed = false;
        const inputSource = event.data;
        if (debugState.isDataDebugEnabled()) {
            logger.debug(`Controller ${controllerId} squeeze end`);
        }
        this.squeezeEndHandlers.forEach(handler => {
            try {
                handler({ controller, inputSource, data: event.data });
            }
            catch (error) {
                logger.error('Error in squeezeEnd handler:', createErrorMetadata(error));
            }
        });
    }
    // Event subscription methods
    onSelectStart(handler) {
        this.selectStartHandlers.push(handler);
        return () => {
            this.selectStartHandlers = this.selectStartHandlers.filter(h => h !== handler);
        };
    }
    onSelectEnd(handler) {
        this.selectEndHandlers.push(handler);
        return () => {
            this.selectEndHandlers = this.selectEndHandlers.filter(h => h !== handler);
        };
    }
    onSqueezeStart(handler) {
        this.squeezeStartHandlers.push(handler);
        return () => {
            this.squeezeStartHandlers = this.squeezeStartHandlers.filter(h => h !== handler);
        };
    }
    onSqueezeEnd(handler) {
        this.squeezeEndHandlers.push(handler);
        return () => {
            this.squeezeEndHandlers = this.squeezeEndHandlers.filter(h => h !== handler);
        };
    }
    // New event subscription methods for hand interactions
    onGestureRecognized(handler) {
        this.gestureRecognizedHandlers.push(handler);
        return () => {
            this.gestureRecognizedHandlers = this.gestureRecognizedHandlers.filter(h => h !== handler);
        };
    }
    onHandsVisibilityChanged(handler) {
        this.handsVisibilityChangedHandlers.push(handler);
        return () => {
            this.handsVisibilityChangedHandlers = this.handsVisibilityChangedHandlers.filter(h => h !== handler);
        };
    }
    // Method to notify gesture events
    notifyGestureRecognized(gesture) {
        this.gestureRecognizedHandlers.forEach(handler => {
            try {
                handler(gesture);
            }
            catch (error) {
                logger.error('Error in gesture recognition handler:', createErrorMetadata(error));
            }
        });
    }
    // Method to notify hand visibility changes
    notifyHandsVisibilityChanged(visible) {
        this.handsVisibilityChangedHandlers.forEach(handler => {
            try {
                handler(visible);
            }
            catch (error) {
                logger.error('Error in hand visibility handler:', createErrorMetadata(error));
            }
        });
    }
    // XR state methods
    isSessionActive() {
        return this.sessionActive;
    }
    getControllers() {
        return this.controllers;
    }
    getControllerGrips() {
        return this.controllerGrips;
    }
    updateSettings(settings) {
        this.settings = settings;
        // Update reference space if settings changed
        if (this.renderer && settings.xr) {
            this.renderer.xr.setReferenceSpaceType(settings.xr.roomScale ? 'local-floor' : 'local');
        }
    }
    dispose() {
        // Remove controllers from scene
        this.controllers.forEach(controller => {
            controller.removeFromParent();
            // Remove all event listeners
            controller.removeEventListener('selectstart', () => { });
            controller.removeEventListener('selectend', () => { });
            controller.removeEventListener('squeezestart', () => { });
            controller.removeEventListener('squeezeend', () => { });
        });
        // Remove controller grips from scene
        this.controllerGrips.forEach(grip => {
            grip.removeFromParent();
        });
        // Remove VR button
        if (this.vrButton && this.vrButton.parentNode) {
            this.vrButton.parentNode.removeChild(this.vrButton);
        }
        // Clear arrays
        this.controllers = [];
        this.controllerGrips = [];
        this.selectStartHandlers = [];
        this.selectEndHandlers = [];
        this.squeezeStartHandlers = [];
        this.squeezeEndHandlers = [];
        this.gestureRecognizedHandlers = [];
        this.handsVisibilityChangedHandlers = [];
        this.handTrackingStateHandlers = [];
        // Clear factory
        this.controllerModelFactory = null;
        // Remove references
        this.renderer = null;
        this.camera = null;
        this.scene = null;
        this.vrButton = null;
        if (debugState.isEnabled()) {
            logger.info('XR session manager disposed');
        }
    }
}
