import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
import { SceneManager } from './scene-manager';
import { Settings } from '../types/settings';

const logger = createLogger('XRSessionManager');

export interface XRControllerEvent {
  controller: THREE.XRTargetRaySpace;
  inputSource: XRInputSource;
  data?: any;
}

type XRControllerEventHandler = (event: XRControllerEvent) => void;

export class XRSessionManager {
  private static instance: XRSessionManager;
  private sceneManager: SceneManager;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private scene: THREE.Scene | null = null;
  private controllers: THREE.XRTargetRaySpace[] = [];
  private controllerGrips: THREE.Object3D[] = [];
  private controllerModelFactory: XRControllerModelFactory | null = null;
  private vrButton: HTMLElement | null = null;
  private sessionActive: boolean = false;
  private settings: Settings | null = null;
  
  // Event handlers
  private selectStartHandlers: XRControllerEventHandler[] = [];
  private selectEndHandlers: XRControllerEventHandler[] = [];
  private squeezeStartHandlers: XRControllerEventHandler[] = [];
  private squeezeEndHandlers: XRControllerEventHandler[] = [];
  
  private constructor(sceneManager: SceneManager) {
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
  
  public static getInstance(sceneManager: SceneManager): XRSessionManager {
    if (!XRSessionManager.instance) {
      XRSessionManager.instance = new XRSessionManager(sceneManager);
    }
    return XRSessionManager.instance;
  }
  
  public initialize(settings: Settings): void {
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
        this.renderer.xr.setReferenceSpaceType(
          settings.xr?.roomScale ? 'local-floor' : 'local'
        );
        
        // Create VR button
        this.createVRButton();
        
        // Create controllers
        this.setupControllers();
        
        if (debugState.isEnabled()) {
          logger.info('XR session manager initialized successfully');
        }
      } else {
        logger.warn('WebXR not supported in this browser');
      }
    } catch (error) {
      logger.error('Failed to initialize XR:', createErrorMetadata(error));
    }
  }
  
  private createVRButton(): void {
    if (!this.renderer) return;
    
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
    } catch (error) {
      logger.error('Failed to create VR button:', createErrorMetadata(error));
    }
  }
  
  private setupControllers(): void {
    if (!this.renderer || !this.scene) return;
    
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
              handedness: (event as any).data?.handedness,
              targetRayMode: (event as any).data?.targetRayMode
            });
          }
        });
        controller.addEventListener('disconnected', () => {
          if (debugState.isEnabled()) {
            logger.info(`Controller ${i} disconnected`);
          }
        });
        
        this.scene.add(controller);
        this.controllers.push(controller as THREE.XRTargetRaySpace);
        
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
    } catch (error) {
      logger.error('Failed to set up XR controllers:', createErrorMetadata(error));
    }
  }
  
  // Event handlers
  private handleSelectStart(event: any, controllerId: number): void {
    if (controllerId >= this.controllers.length) return;
    
    const controller = this.controllers[controllerId];
    controller.userData.selectPressed = true;
    
    const inputSource = event.data;
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Controller ${controllerId} select start`);
    }
    
    this.selectStartHandlers.forEach(handler => {
      try {
        handler({ controller, inputSource, data: event.data });
      } catch (error) {
        logger.error('Error in selectStart handler:', createErrorMetadata(error));
      }
    });
  }
  
  private handleSelectEnd(event: any, controllerId: number): void {
    if (controllerId >= this.controllers.length) return;
    
    const controller = this.controllers[controllerId];
    controller.userData.selectPressed = false;
    
    const inputSource = event.data;
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Controller ${controllerId} select end`);
    }
    
    this.selectEndHandlers.forEach(handler => {
      try {
        handler({ controller, inputSource, data: event.data });
      } catch (error) {
        logger.error('Error in selectEnd handler:', createErrorMetadata(error));
      }
    });
  }
  
  private handleSqueezeStart(event: any, controllerId: number): void {
    if (controllerId >= this.controllers.length) return;
    
    const controller = this.controllers[controllerId];
    controller.userData.squeezePressed = true;
    
    const inputSource = event.data;
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Controller ${controllerId} squeeze start`);
    }
    
    this.squeezeStartHandlers.forEach(handler => {
      try {
        handler({ controller, inputSource, data: event.data });
      } catch (error) {
        logger.error('Error in squeezeStart handler:', createErrorMetadata(error));
      }
    });
  }
  
  private handleSqueezeEnd(event: any, controllerId: number): void {
    if (controllerId >= this.controllers.length) return;
    
    const controller = this.controllers[controllerId];
    controller.userData.squeezePressed = false;
    
    const inputSource = event.data;
    if (debugState.isDataDebugEnabled()) {
      logger.debug(`Controller ${controllerId} squeeze end`);
    }
    
    this.squeezeEndHandlers.forEach(handler => {
      try {
        handler({ controller, inputSource, data: event.data });
      } catch (error) {
        logger.error('Error in squeezeEnd handler:', createErrorMetadata(error));
      }
    });
  }
  
  // Event subscription methods
  public onSelectStart(handler: XRControllerEventHandler): () => void {
    this.selectStartHandlers.push(handler);
    return () => {
      this.selectStartHandlers = this.selectStartHandlers.filter(h => h !== handler);
    };
  }
  
  public onSelectEnd(handler: XRControllerEventHandler): () => void {
    this.selectEndHandlers.push(handler);
    return () => {
      this.selectEndHandlers = this.selectEndHandlers.filter(h => h !== handler);
    };
  }
  
  public onSqueezeStart(handler: XRControllerEventHandler): () => void {
    this.squeezeStartHandlers.push(handler);
    return () => {
      this.squeezeStartHandlers = this.squeezeStartHandlers.filter(h => h !== handler);
    };
  }
  
  public onSqueezeEnd(handler: XRControllerEventHandler): () => void {
    this.squeezeEndHandlers.push(handler);
    return () => {
      this.squeezeEndHandlers = this.squeezeEndHandlers.filter(h => h !== handler);
    };
  }
  
  // XR state methods
  public isSessionActive(): boolean {
    return this.sessionActive;
  }
  
  public getControllers(): THREE.XRTargetRaySpace[] {
    return this.controllers;
  }
  
  public getControllerGrips(): THREE.Object3D[] {
    return this.controllerGrips;
  }
  
  public updateSettings(settings: Settings): void {
    this.settings = settings;
    
    // Update reference space if settings changed
    if (this.renderer && settings.xr) {
      this.renderer.xr.setReferenceSpaceType(
        settings.xr.roomScale ? 'local-floor' : 'local'
      );
    }
  }
  
  public dispose(): void {
    // Remove controllers from scene
    this.controllers.forEach(controller => {
      controller.removeFromParent();
      // Remove all event listeners
      controller.removeEventListener('selectstart', () => {});
      controller.removeEventListener('selectend', () => {});
      controller.removeEventListener('squeezestart', () => {});
      controller.removeEventListener('squeezeend', () => {});
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