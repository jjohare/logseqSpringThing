import {
    Group,
    GridHelper,
    PlaneGeometry,
    MeshPhongMaterial,
    Mesh,
    RingGeometry,
    MeshBasicMaterial,
    DirectionalLight,
    SphereGeometry,
    Color,
    DoubleSide
} from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
import { createLogger } from '../core/utils';
import { platformManager } from '../platform/platformManager';
import { SceneManager } from '../rendering/scene';
import { BACKGROUND_COLOR } from '../core/constants';
import { debugState } from '../core/debugState';
import { NodeManagerFacade } from '../rendering/node/NodeManagerFacade';
import { MaterialFactory } from '../rendering/factories/MaterialFactory';
import { ModularControlPanel } from '../ui/ModularControlPanel';
import { SettingsStore } from '../state/SettingsStore';
import { Settings } from '../types/settings/base';
import { XRSettings } from '../types/settings/xr';
const logger = createLogger('XRSessionManager');

export class XRSessionManager {
    private static instance: XRSessionManager | null = null;
    private readonly sceneManager: SceneManager;
    private readonly settingsStore: SettingsStore;
    private readonly nodeManager: NodeManagerFacade;
    private session: XRSession | null = null;
    /* @ts-ignore - Used in XR session lifecycle */
    private referenceSpace: XRReferenceSpace | null = null;
    private isPresenting: boolean = false;
    private isCleaningUp: boolean = false;
    private settingsUnsubscribe: (() => void) | null = null;
    private currentSettings: XRSettings;
    /* @ts-ignore - Used in XR session lifecycle */
    private hitTestSourceRequested = false;
    /* @ts-ignore - Used in XR session lifecycle */
    private xrAnimationFrameCallback: ((frame: XRFrame) => void) | null = null;

    // XR specific objects
    private cameraRig: Group;
    private arGroup: Group; // Group for AR environment elements (grid, ground plane, etc.)
    private arGraphGroup: Group; // Separate group for graph nodes in AR
    private arUIGroup: Group; // Group for UI elements in AR
    private controllers: Group[];
    private controllerGrips: Group[];
    private controllerModelFactory: XRControllerModelFactory;

    // AR specific objects
    private gridHelper: GridHelper;
    private groundPlane: Mesh;
    private hitTestMarker: Mesh;
    private arLight: DirectionalLight;
    private hitTestSource: XRHitTestSource | null = null;

    // Event handlers
    private xrSessionStartCallback: (() => void) | null = null;
    private xrSessionEndCallback: (() => void) | null = null;
    private controllerAddedCallback: ((controller: Group) => void) | null = null;
    private controllerRemovedCallback: ((controller: Group) => void) | null = null;

    private constructor(sceneManager: SceneManager) {
        this.sceneManager = sceneManager;
        this.settingsStore = SettingsStore.getInstance();
        const settings = this.settingsStore.get('') as Settings;
        const materialFactory = MaterialFactory.getInstance();
        this.nodeManager = NodeManagerFacade.getInstance(
            sceneManager.getScene(),
            sceneManager.getCamera(),
            materialFactory.getNodeMaterial(settings)
        );
        // Initialize with current settings
        this.currentSettings = this.settingsStore.get('xr') as XRSettings;
        
        // Set up settings subscription
        this.setupSettingsSubscription();
        
        // Initialize XR objects
        this.cameraRig = new Group();
        this.arGroup = new Group(); // Group for AR elements
        this.arGraphGroup = new Group(); // Group for graph nodes in AR
        this.arUIGroup = new Group(); // Group for UI elements in AR
        this.controllers = [new Group(), new Group()];
        this.controllerGrips = [new Group(), new Group()];
        this.controllerModelFactory = new XRControllerModelFactory();

        // Set up AR group hierarchy
        this.arGroup.add(this.arGraphGroup);
        this.arGroup.add(this.arUIGroup);

        // Initialize AR objects
        this.gridHelper = this.createGridHelper();
        this.groundPlane = this.createGroundPlane();
        this.hitTestMarker = this.createHitTestMarker();
        this.arLight = this.createARLight();

        // Explicitly ensure ground plane is not visible by default
        this.groundPlane.visible = false;

        this.setupXRObjects();
    }

    private async setupSettingsSubscription(): Promise<void> {
        // Subscribe to XR settings changes
        this.settingsUnsubscribe = await this.settingsStore.subscribe('xr', () => {
            this.currentSettings = this.settingsStore.get('xr') as XRSettings;
            this.applyXRSettings();
        });
    }

    private createGridHelper(): GridHelper {
        const grid = new GridHelper(0.5, 5, 0x808080, 0x808080); // 0.5 meter grid with 5x5 divisions
        grid.material.transparent = true;
        grid.material.opacity = 0.2; // Further reduced opacity
        grid.position.y = -0.01; // Slightly below ground to avoid z-fighting
        grid.visible = false; // Start hidden until AR session begins
        grid.layers.enable(0); // Enable default layer
        grid.layers.enable(1); // Enable AR layer
        return grid;
    }

    private createGroundPlane(): Mesh {
        const geometry = new PlaneGeometry(0.5, 0.5); // 0.5x0.5 meter plane
        const material = new MeshPhongMaterial({
            color: 0x808080, // Medium gray color
            transparent: true,
            opacity: 0.1, // More transparent to avoid visual interference
            side: DoubleSide,
            depthWrite: false, // Prevent depth writing to avoid z-fighting
            depthTest: false // Disable depth testing to prevent occlusion of other elements
        });
        
        const plane = new Mesh(geometry, material);
        plane.rotateX(-Math.PI / 2);
        plane.position.y = -0.015; // Slightly below grid but not too far
        plane.visible = false; // Start hidden until AR session begins
        plane.layers.enable(0); // Enable default layer
        plane.layers.enable(1); // Enable AR layer
        return plane;
    }

    private createHitTestMarker(): Mesh {
        const geometry = new RingGeometry(0.15, 0.2, 32);
        const material = new MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            side: DoubleSide
        });
        const marker = new Mesh(geometry, material);
        marker.rotateX(-Math.PI / 2);
        marker.visible = false;
        marker.layers.enable(0); // Enable default layer
        marker.layers.enable(1); // Enable AR layer
        return marker;
    }

    private createARLight(): DirectionalLight {
        const light = new DirectionalLight(0xffffff, 1);
        light.position.set(1, 1, 1);
        light.layers.enable(0); // Enable default layer
        light.layers.enable(1); // Enable AR layer
        return light;
    }

    private setupXRObjects(): void {
        const scene = this.sceneManager.getScene();
        
        // Reset and verify initial scales
        this.cameraRig.scale.setScalar(1);
        this.arGroup.scale.setScalar(1);
        this.arGraphGroup.scale.setScalar(1);
        if (debugState.isEnabled() && platformManager.isQuest()) {
            logger.info('Initial scales:', { cameraRig: this.cameraRig.scale.x, arGroup: this.arGroup.scale.x, arGraphGroup: this.arGraphGroup.scale.x });
        }
        
        // Add camera rig to scene
        scene.add(this.cameraRig);

        // Add AR group to camera rig
        this.cameraRig.add(this.arGroup);

        // Add AR objects to AR group
        this.arGroup.add(this.gridHelper);
        this.arGroup.add(this.groundPlane);
        this.arGroup.add(this.hitTestMarker);
        this.arGroup.add(this.arLight);
        this.arGroup.add(this.arGraphGroup);

        // Setup controllers
        this.controllers.forEach((_controller: Group, index: number) => {
            this.setupController(index);
        });

        // Setup controller grips
        this.controllerGrips.forEach((grip: Group) => {
            this.setupControllerGrip(grip);
        });
    }

    private setupController(index: number): void {
        const controller = this.controllers[index];
        const controllerGrip = this.controllerGrips[index];

        // Store event handlers as properties for proper cleanup
        const onControllerConnected = (event: any) => {
            const inputSource = event.data;
            controller.userData.inputSource = inputSource;
            const controllerModel = this.buildController(inputSource);
            controller.add(controllerModel);
            this.notifyControllerAdded(controller);
        };

        const onControllerDisconnected = () => {
            controller.userData.inputSource = null;
            controller.remove(...controller.children);
            this.notifyControllerRemoved(controller);
        };

        // Store handlers in userData for cleanup
        controller.userData.eventHandlers = {
            connected: onControllerConnected,
            disconnected: onControllerDisconnected
        };

        controller.addEventListener('connected', onControllerConnected);
        controller.addEventListener('disconnected', onControllerDisconnected);

        this.cameraRig.add(controller);
        this.cameraRig.add(controllerGrip);
    }

    private setupControllerGrip(grip: Group): void {
        const controllerModel = this.controllerModelFactory.createControllerModel(grip);
        grip.add(controllerModel);
    }

    private buildController(_inputSource: XRInputSource): Group {
        const controller = new Group();
        const geometry = new SphereGeometry(0.1, 16, 16);
        const material = new MeshBasicMaterial({ color: 0xffffff });
        const sphere = new Mesh(geometry, material);
        controller.add(sphere);
        return controller;
    }

    public static getInstance(sceneManager: SceneManager): XRSessionManager {
        if (!XRSessionManager.instance) {
            XRSessionManager.instance = new XRSessionManager(sceneManager);
        }
        return XRSessionManager.instance;
    }

    public setSessionCallbacks(
        onStart: () => void,
        onEnd: () => void,
        onFrame: (frame: XRFrame) => void
    ): void {
        this.xrSessionStartCallback = onStart;
        this.xrSessionEndCallback = onEnd;
        this.xrAnimationFrameCallback = onFrame;
    }

    public isXRPresenting(): boolean {
        return this.isPresenting;
    }

    public async initXRSession(): Promise<void> {
        if (this.isPresenting) {
            if (debugState.isEnabled()) {
                logger.warn('XR session already active');
            }
            return;
        }
        
        if (platformManager.xrSessionState !== 'inactive') {
            if (debugState.isEnabled()) {
                logger.warn('XR session already active');
            }
            return;
        }

        if (!platformManager.getCapabilities().xrSupported || !navigator.xr) {
            throw new Error('XR not supported on this platform');
        }

        try {
            // Check if session mode is supported
            const mode = platformManager.isQuest() ? 'immersive-ar' : 'immersive-vr';
            const isSupported = await navigator.xr.isSessionSupported(mode);
            
            if (!isSupported) {
                throw new Error(`${mode} not supported on this device`);
            }
            
            // Configure features based on mode and platform
            const requiredFeatures = ['local-floor'];
            const optionalFeatures = ['hand-tracking', 'layers'];
            
            // Add mode-specific features for Quest
            if (platformManager.isQuest()) {
                requiredFeatures.push('hit-test');
                optionalFeatures.push(
                    'light-estimation',
                    'plane-detection',
                    'anchors',
                    'depth-sensing',
                    'dom-overlay'
                );
            }
            
            // Request session with configured features
            const sessionInit: XRSessionInit = {
                requiredFeatures,
                optionalFeatures,
                domOverlay: platformManager.isQuest() ? { root: document.body } : undefined
            };
            
            if (debugState.isEnabled()) {
                logger.info('Requesting XR session with config:', {
                    mode,
                    features: sessionInit
                });
            }
            
            const session = await navigator.xr.requestSession(mode, sessionInit);
            platformManager.xrSessionState = 'active';

            if (!session) {
                throw new Error('Failed to create XR session');
            }

            this.session = session;

            // Setup XR rendering
            const renderer = this.sceneManager.getRenderer();
            await renderer.xr.setSession(this.session);
            
            // Configure renderer for AR
            renderer.xr.enabled = true;
            
            // Set up scene for XR mode
            const scene = this.sceneManager.getScene();
            if (platformManager.isQuest()) {
                // Clear background for AR passthrough
                scene.background = null;
            } else {
                // Keep background for VR mode
                scene.background = new Color(BACKGROUND_COLOR);
            }
            
            // Get reference space based on platform
            const spaceType = platformManager.isQuest() ? 'local-floor' : 'bounded-floor';
            this.referenceSpace = await this.session.requestReferenceSpace(spaceType);
            
            // Setup session event handlers
            this.session.addEventListener('end', this.onXRSessionEnd);

            // Enable AR layer for camera
            const camera = this.sceneManager.getCamera();
            camera.layers.enable(1);
            
            // Apply AR scale if in AR mode
            if (platformManager.isQuest()) {
                // Use direct room scale for better AR sizing
                // Use roomScale directly for consistent AR sizing
                const arScale = this.currentSettings.roomScale;
                if (debugState.isEnabled()) {
                    logger.info('Setting initial AR scale:', { 
                        arScale, 
                        roomScale: this.currentSettings.roomScale,
                        cameraRigScale: this.cameraRig.scale.x,
                        arGroupScale: this.arGroup.scale.x,
                        arGraphGroupScale: this.arGraphGroup.scale.x,
                        currentGroupScale: this.arGroup.scale.x
                    });
                }

                this.arGroup.scale.setScalar(arScale);
                
                // Move node instances to arGroup for proper scaling
                const instanceMesh = this.nodeManager.getInstancedMesh();
                if (instanceMesh) {
                    // Enable both layers for the mesh and its children
                    instanceMesh.layers.enable(0);
                    instanceMesh.layers.enable(1);
                    instanceMesh.traverse((child: any) => {
                        if (child.layers) {
                            child.layers.enable(0);
                            child.layers.enable(1);
                        }
                    });
                    this.arGroup.add(instanceMesh);
                }
            }

            // Reset camera rig position
            this.cameraRig.position.set(0, 0, 0);
            this.cameraRig.quaternion.identity();

            // Show AR visualization elements after a short delay to ensure proper placement
            setTimeout(() => {
                this.gridHelper.visible = true;
                // Force ground plane to remain invisible to prevent occlusion of node labels
                this.groundPlane.visible = false;
                this.arLight.visible = true;
            }, 1500); // Increased delay for better stability
            
            this.isPresenting = true;
            if (debugState.isEnabled()) {
                logger.info('XR session initialized');
            }

            // Hide control panel in XR mode
            const controlPanel = ModularControlPanel.getInstance();
            if (controlPanel) {
                controlPanel.hide();
            }

            // Notify session start
            if (this.xrSessionStartCallback) {
                this.xrSessionStartCallback();
            }
        } catch (error) {
            if (debugState.isEnabled()) {
                logger.error('Failed to initialize XR session:', error);
            }
            throw error;
        }
    }

    public async endXRSession(): Promise<void> {
        if (!this.session) {
            return;
        }
        
        // Prevent multiple cleanup attempts
        if (this.isCleaningUp) {
            logger.warn('XR session cleanup already in progress');
            return;
        }
        
        this.isCleaningUp = true;
        platformManager.xrSessionState = 'ending';
        try {
            await this.session.end();
        } catch (error) {
            logger.error('Error ending XR session:', error);
        } finally {
            this.isCleaningUp = false;
        }
    }

    public getControllers(): Group[] {
        return this.controllers;
    }

    public getControllerGrips(): Group[] {
        return this.controllerGrips;
    }

    private notifyControllerAdded(controller: Group): void {
        if (this.controllerAddedCallback) {
            this.controllerAddedCallback(controller);
        }
    }

    private notifyControllerRemoved(controller: Group): void {
        if (this.controllerRemovedCallback) {
            this.controllerRemovedCallback(controller);
        }
    }

    public onXRSessionEnd = (): void => {
        // This happens when user exits XR mode
        
        // Explicitly ensure ground plane and other AR objects are hidden
        this.gridHelper.visible = false;
        this.groundPlane.visible = false;
        this.hitTestMarker.visible = false;
        this.arLight.visible = false;
        
        platformManager.xrSessionState = 'inactive';
        // Return to desktop mode
        platformManager.setXRMode(false);
        
        if (debugState.isEnabled()) {
            logger.info('XR session ended and cleaned up');
        }
        
        // Show control panel and notify session end (only once)
        ModularControlPanel.getInstance()?.show();
        
        // Use setTimeout to ensure the callback is called after the browser has had time to process the session end
        setTimeout(() => {
            this.xrSessionEndCallback?.();
        }, 100);
    }

    private applyXRSettings(): void {
        if (!this.isPresenting) return;
        
        this.updateCamera();

        // Apply settings to controllers
        const controllers = this.getControllers();
        controllers.forEach(controller => {
            // Apply hand mesh visibility settings
            if (this.currentSettings.handMeshEnabled !== undefined) {
                controller.traverse((object: { name?: string; visible: boolean }) => {
                    if (object.name === 'handMesh') {
                        object.visible = !!this.currentSettings.handMeshEnabled;
                    }
                });
            }

            // Apply hand ray visibility settings
            if (this.currentSettings.handRayEnabled !== undefined) {
                controller.traverse((object: { name?: string; visible: boolean }) => {
                    if (object.name === 'ray') {
                        object.visible = !!this.currentSettings.handRayEnabled;
                    }
                });
            }
        });

        // Update scale based on platform
        if (this.currentSettings.roomScale !== undefined) {
            if (platformManager.isQuest()) {
                const arScale = Number(this.currentSettings.roomScale);
                this.arGroup.scale.setScalar(arScale);
            } else {
                this.cameraRig.scale.setScalar(Number(this.currentSettings.roomScale));
            }
        }
    }
    
    /**
     * Updates the camera matrices and layers when XR mode changes
     */
    private updateCamera(): void {
        if (!this.isPresenting) return;
        
        const camera = this.sceneManager.getCamera();
        const renderer = this.sceneManager.getRenderer();
        
        // Make sure the camera matrices are properly updated
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();
        
        // Set up correct layers
        if (platformManager.isQuest()) {
            // In AR mode, enable layer 1 for XR content
            camera.layers.disable(0);
            camera.layers.enable(1);
        } else {
            // In VR mode, enable both layers
            camera.layers.enable(0);
            camera.layers.enable(1);
        }
        
        // Make sure XR is enabled in the renderer
        renderer.xr.enabled = true;
    }

    public dispose(): void {
        if (this.settingsUnsubscribe) {
            this.settingsUnsubscribe();
            this.settingsUnsubscribe = null;
        }

        if (this.session) {
            this.session.removeEventListener('end', this.onXRSessionEnd);
            this.session.end().catch(console.error);
        }

        this.controllers.forEach(controller => {
            const handlers = controller.userData.eventHandlers;
            if (handlers) {
                controller.removeEventListener('connected', handlers.connected);
                controller.removeEventListener('disconnected', handlers.disconnected);
                delete controller.userData.eventHandlers;
            }
            controller.userData.inputSource = null;
        });

        this.controllerGrips.forEach(grip => {
            grip.remove(...grip.children);
        });

        this.hitTestSource?.cancel();
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;

        this.session = null;
        this.referenceSpace = null;
        this.isPresenting = false;

        this.xrSessionStartCallback = null;
        this.xrSessionEndCallback = null;
        this.xrAnimationFrameCallback = null;
        this.controllerAddedCallback = null;
        this.controllerRemovedCallback = null;

        XRSessionManager.instance = null;
    }
}
