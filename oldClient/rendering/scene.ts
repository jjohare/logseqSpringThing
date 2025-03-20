/**
 * Three.js scene management with simplified setup
 */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  GridHelper,
  Layers,
  Vector2,
  Object3D,
  Mesh,
  Material,
  AmbientLight,
  DirectionalLight
} from 'three';
import * as EffectComposerModule from 'three/examples/jsm/postprocessing/EffectComposer';
import * as RenderPassModule from 'three/examples/jsm/postprocessing/RenderPass';
import * as UnrealBloomPassModule from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import * as OrbitControlsModule from 'three/examples/jsm/controls/OrbitControls';
import { VisualizationController } from './VisualizationController';
import { HologramShaderMaterial } from './materials/HologramShaderMaterial';
import { Settings } from '../types/settings/base';
import { defaultSettings } from '../state/defaultSettings';
import { debugState } from '../core/debugState';
import { logger, createErrorMetadata, createDataMetadata } from '../core/logger';
import { resourceMonitor } from '../core/resourceMonitor';
import { NodeInteractionManager } from './node/interaction/NodeInteractionManager';

const BACKGROUND_COLOR = 0x000000;  // Material Design Grey 900
const LOW_PERF_FPS_THRESHOLD = 30;  // Lower FPS threshold for low performance mode

export class SceneManager {
  private static instance: SceneManager;
  
  // Three.js core components
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer!: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private currentRenderingSettings: Settings['visualization']['rendering'] | null = null;
  private controls!: OrbitControlsModule.OrbitControls & { dispose: () => void };
  private sceneGrid: GridHelper | null = null;
  
  // Define bloom layer
  private readonly BLOOM_LAYER = 1;
  private readonly bloomLayer = new Layers();
  
  // Post-processing
  private composer!: EffectComposerModule.EffectComposer;
  private bloomPass!: UnrealBloomPassModule.UnrealBloomPass;
  
  // Animation
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;
  private nodeInteractionManager: NodeInteractionManager | null = null;
  private visualizationController: VisualizationController | null = null;
  private lastFrameTime: number = performance.now();
  private readonly FRAME_BUDGET: number = 16; // Target 60fps (1000ms/60)
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 60;
  private lastLoggedFps: number = 60; // Track last logged FPS
  private readonly FPS_LOG_THRESHOLD = 5.0; // Increased threshold to reduce log frequency

  private constructor(canvas: HTMLCanvasElement) {
    logger.log('Initializing SceneManager');
    this.canvas = canvas;
    
    // Create scene
    this.scene = new Scene();
    this.scene.background = new Color(BACKGROUND_COLOR);

    // Create camera with wider view
    this.camera = new PerspectiveCamera(
      60, // Reduced FOV for less distortion
      window.innerWidth / window.innerHeight,
      0.1,
      5000  // Increased far plane for larger visualization space
    );
    this.camera.position.set(0, 10, 50); // Position for better overview
    this.camera.lookAt(0, 0, 0);
    
    // Configure bloom layer
    this.bloomLayer.set(this.BLOOM_LAYER);
    
    // Enable both layers for desktop mode by default
    this.camera.layers.enable(0); // Desktop layer
    this.camera.layers.enable(this.BLOOM_LAYER); // Bloom/XR layer

    this.initializeRenderer();
    this.setupControls();
    this.setupLighting();

    // Setup event listeners
    window.addEventListener('resize', this.handleResize.bind(this));

    // Initialize visualization controller
    this.visualizationController = VisualizationController.getInstance();
    this.visualizationController.initializeScene(this.scene, this.camera);

    logger.log('SceneManager initialization complete');
  }

  private initializeRenderer(): void {
    try {
      // Create renderer with WebXR support
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      HologramShaderMaterial.setRenderer(this.renderer);
      
      // Track renderer in resource monitor
      resourceMonitor.trackRenderer(this.renderer);
      
      // Remove unsupported properties
      // this.renderer.sortObjects = false;
      // this.renderer.physicallyCorrectLights = false;

      // Setup post-processing
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (debugState.isDataDebugEnabled()) {
        logger.debug('Renderer initialized and set for shader validation');
      }
      
      this.composer = new EffectComposerModule.EffectComposer(this.renderer);
      const renderPass = new RenderPassModule.RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      const bloomSettings = defaultSettings.visualization.bloom;

      // Initialize bloom
      this.bloomPass = new UnrealBloomPassModule.UnrealBloomPass(
        new Vector2(window.innerWidth, window.innerHeight),
        bloomSettings.strength || 3.0,
        bloomSettings.radius || 2.0,
        bloomSettings.threshold || 0.0
      );

      // Store custom bloom settings as properties
      (this.bloomPass as any).edgeStrength = bloomSettings.edgeBloomStrength || 2.0;
      (this.bloomPass as any).nodeStrength = bloomSettings.nodeBloomStrength || 3.0;
      (this.bloomPass as any).environmentStrength = bloomSettings.environmentBloomStrength || 3.0;
      
      this.composer.addPass(this.bloomPass);
      
    } catch (error) {
      logger.error('Failed to initialize renderer or post-processing:', createErrorMetadata(error));
      throw new Error('Failed to initialize rendering system');
    }
  }

  private setupControls(): void {
    this.controls = new OrbitControlsModule.OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 2000;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.rotateSpeed = 1.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.8;
  }

  static getInstance(canvas: HTMLCanvasElement): SceneManager {
    if (!SceneManager.instance) {
      SceneManager.instance = new SceneManager(canvas);
    }
    return SceneManager.instance;
  }

  static cleanup(): void {
    if (SceneManager.instance) {
      SceneManager.instance.dispose();
      SceneManager.instance = null as any;
    }
    
    // Stop resource monitoring
    resourceMonitor.stopMonitoring();
  }

  private setupLighting(): void {
    const ambientLight = new AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1).normalize();
    this.scene.add(directionalLight);

    // Add smaller grid helper
    const gridHelper = new GridHelper(100, 100); // Increased grid size to match visualization space
    if (gridHelper.material instanceof Material) {
      gridHelper.material.transparent = true;
      gridHelper.material.opacity = 0.1;
    }
    this.scene.add(gridHelper);
    this.sceneGrid = gridHelper;
  }

  // Debounce function to limit how often a function is called
  private debounce(func: Function, wait: number): (...args: any[]) => void {
    let timeout: number | null = null;
    return (...args: any[]) => {
      const later = () => {
        timeout = null;
        func(...args);
      };
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      timeout = window.setTimeout(later, wait);
    };
  }

  private handleResize(): void {
    // Use requestAnimationFrame to ensure resize happens in the next frame
    // This helps avoid layout thrashing and improves performance
    requestAnimationFrame(() => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
      this.composer.setSize(width, height);
      
      // Update bloom resolution
      if (this.bloomPass) {
        this.bloomPass.resolution.set(width, height);
      }
    });
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Start resource monitoring
    resourceMonitor.startMonitoring(60000); // Increased monitoring interval to 60 seconds

    // Initialize desktop node interactions
    if (this.visualizationController) {
      const nodeFacade = this.visualizationController.getNodeManagerFacade();
      if (nodeFacade) {
        // Get the instanced mesh from the node facade
        const instanceMesh = nodeFacade.getInstancedMesh();
        
        // Create the NodeInteractionManager directly instead of getting it from facade
        this.nodeInteractionManager = NodeInteractionManager.getInstance(instanceMesh);
        
        // Connect to the instance manager
        const nodeInstanceManager = nodeFacade.getNodeInstanceManager();
        
        // Initialize with the node instance manager if available
        if (this.nodeInteractionManager && nodeInstanceManager) {
          this.nodeInteractionManager.setNodeInstanceManager(nodeInstanceManager);
          
          // Initialize desktop interactions with the canvas and camera
          this.nodeInteractionManager.initializeDesktopInteraction(this.canvas, this.camera);
          
          logger.info('Desktop node interactions initialized');
        } else {
          logger.warn('Could not initialize NodeInteractionManager - missing dependencies');
        }
        
      }
    }
    
    // Use debounced resize handler to avoid performance issues
    window.removeEventListener('resize', this.handleResize.bind(this));
    window.addEventListener('resize', this.debounce(this.handleResize.bind(this), 100));
    
    requestAnimationFrame(this.animate);
    logger.log('Scene rendering started');
  }

  // Alias for start() to maintain compatibility with new client code
  startRendering(): void {
    this.start();
  }

  stop(): void {
    this.isRunning = false;
    
    // Clean up animation loops
    if (this.renderer.xr.enabled) {
      this.renderer.setAnimationLoop(null);
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    logger.log('Scene rendering stopped');
  }

  // Throttle function to limit execution frequency
  private throttleFrameUpdates(timestamp: number): boolean {
    // Skip frame if we're running too fast (trying to maintain ~60fps)
    const elapsed = timestamp - this.lastFrameTime;
    const minFrameTime = 16; // ~60fps
    
    if (elapsed < minFrameTime && this.currentFps > 60) {
      return false; // Skip this frame
    }
    return true; // Process this frame
  }

  private animate = (timestamp: number): void => {
    if (!this.isRunning) return;

    // Calculate FPS
    this.frameCount++;
    if (timestamp - this.lastFpsUpdate >= 1000) {
      const elapsed = timestamp - this.lastFpsUpdate;
      this.currentFps = elapsed > 0 ? (this.frameCount * 1000) / elapsed : 60;
      this.frameCount = 0;
      this.lastFpsUpdate = timestamp;

      // Apply performance optimizations if FPS is low
      this.checkPerformance();
    }

    const deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    // Set up animation loop
    if (this.renderer.xr.enabled) {
      // For XR, use the built-in animation loop
      this.renderer.setAnimationLoop(this.render);
    } else {
      // For non-XR, use requestAnimationFrame
      this.render(deltaTime);
      if (this.isRunning) {
        this.animationFrameId = requestAnimationFrame(this.animate);
      }
    }
  }

  private checkPerformance(): void {
    // Apply performance optimizations if FPS is low
    if (this.currentFps < LOW_PERF_FPS_THRESHOLD) {
      this.applyLowPerformanceOptimizations();
    } else if (this.currentFps > 80) {
      // If FPS is very high, we might be wasting resources
      // Consider throttling updates to save battery/CPU
      this.throttleFrameUpdates(performance.now());
    }
  }

  private render = (deltaTime?: number): void => {
    const startTime = performance.now();

    try {
      if (!this.renderer.xr.enabled) {
        if (!deltaTime || deltaTime >= this.FRAME_BUDGET) {
          this.controls.update();
          if (this.sceneGrid) this.sceneGrid.visible = true;
        }
      } else {
        if (this.sceneGrid) this.sceneGrid.visible = false;
      }

      if (this.visualizationController) {
        this.visualizationController.update(Math.min(deltaTime || 0, 33)); // Cap deltaTime to avoid large jumps
      }

      const preRenderTime = performance.now();
      const remainingTime = this.FRAME_BUDGET - (preRenderTime - startTime);

      if (remainingTime >= 0) {
        if (!this.renderer.xr.enabled && this.bloomPass?.enabled) {
          // Always use composer with bloom when enabled, regardless of remaining time
          try {
            this.composer.render();
          } catch (error) {
            logger.error('Error rendering with bloom, falling back to standard render', createErrorMetadata(error));
            this.renderer.render(this.scene, this.camera);
          }
        } else {
          this.renderer.render(this.scene, this.camera);
        }
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (error) {
      logger.error('Render error:', createErrorMetadata(error));
      if (this.bloomPass?.enabled) {
        logger.warn('Disabling bloom pass due to render error');
        this.bloomPass.enabled = false;
      }
    }
  }

  // Public getters
  getScene(): Scene {
    return this.scene;
  }

  getCamera(): PerspectiveCamera {
    return this.camera;
  }

  getRenderer(): WebGLRenderer {
    return this.renderer;
  }

  getControls(): OrbitControlsModule.OrbitControls {
    return this.controls;
  }

  // Scene management methods
  add(object: Object3D): void {
    this.scene.add(object);
  }

  remove(object: Object3D): void {
    this.scene.remove(object);
  }

  public dispose(): void {
    this.stop();
    
    // Clean up node interaction manager
    if (this.nodeInteractionManager) {
      this.nodeInteractionManager.dispose();
      this.nodeInteractionManager = null;
    }
    
    // Remove event listeners
    const boundResize = this.handleResize.bind(this);
    window.removeEventListener('resize', boundResize);

    // Dispose of post-processing
    if (this.composer) {
      // Dispose of render targets
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
      
      // Clear passes
      this.composer.passes.length = 0;
    }

    // Dispose of bloom pass resources
    if (this.bloomPass) {
      // Dispose of any textures or materials used by the bloom pass
      if ((this.bloomPass as any).renderTargetsHorizontal) {
        (this.bloomPass as any).renderTargetsHorizontal.forEach((target: any) => {
          if (target && target.dispose) target.dispose();
        });
      }
      if ((this.bloomPass as any).renderTargetsVertical) {
        (this.bloomPass as any).renderTargetsVertical.forEach((target: any) => {
          if (target && target.dispose) target.dispose();
        });
      }
      if ((this.bloomPass as any).materialHorizontal) {
        (this.bloomPass as any).materialHorizontal.dispose();
      }
      if ((this.bloomPass as any).materialVertical) {
        (this.bloomPass as any).materialVertical.dispose();
      }
    }

    // Dispose of controls
    if (this.controls) {
      this.controls.dispose();
    }

    // Untrack renderer
    if (this.renderer) {
      resourceMonitor.untrackRenderer(this.renderer);
      this.renderer.dispose();
      this.renderer = null as any;
    }

    // Dispose of scene objects
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object instanceof Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
    }

    logger.log('Scene manager disposed');
  }

  public handleSettingsUpdate(settings: Settings): void {
    if (!settings.visualization?.rendering) {
      logger.warn('Received settings update without visualization.rendering section');
      return;
    }

    const { rendering: newRendering, bloom: newBloom } = settings.visualization;
    const hasRenderingChanged = JSON.stringify(this.currentRenderingSettings) !== JSON.stringify(newRendering);

    // Update bloom settings
    if (newBloom) {
      const currentBloom = {
        enabled: this.bloomPass?.enabled ?? false,
        strength: this.bloomPass?.strength ?? 0,
        radius: this.bloomPass?.radius ?? 0,
        threshold: this.bloomPass?.threshold ?? 0,
        edgeStrength: (this.bloomPass as any)?.edgeStrength ?? 0,
        nodeStrength: (this.bloomPass as any)?.nodeStrength ?? 0,
        environmentStrength: (this.bloomPass as any)?.environmentStrength ?? 0
      };

      const newBloomSettings = {
        enabled: newBloom.enabled,
        strength: newBloom.enabled ? (newBloom.strength || defaultSettings.visualization.bloom.strength) : 0,
        radius: newBloom.enabled ? (newBloom.radius || defaultSettings.visualization.bloom.radius) : 0,
        threshold: newBloom.threshold, // Use threshold from settings
        edgeStrength: newBloom.enabled ? (newBloom.edgeBloomStrength || defaultSettings.visualization.bloom.edgeBloomStrength) : 0,
        nodeStrength: newBloom.enabled ? (newBloom.nodeBloomStrength || defaultSettings.visualization.bloom.nodeBloomStrength) : 0,
        environmentStrength: newBloom.enabled ? (newBloom.environmentBloomStrength || defaultSettings.visualization.bloom.environmentBloomStrength) : 0
      };

      const hasBloomChanged = JSON.stringify(currentBloom) !== JSON.stringify(newBloomSettings);
      
      if (hasBloomChanged) {
        // Log bloom settings change
        logger.debug('Updating bloom settings', createDataMetadata({
          from: currentBloom,
          to: newBloomSettings
        }));
        
        // Apply new settings
        if (this.bloomPass) {
          // Handle the enabled state change separately to avoid flashing
          const wasEnabled = this.bloomPass.enabled;
          const shouldBeEnabled = newBloomSettings.enabled;
          
          // Update all other properties first
          this.bloomPass.strength = newBloomSettings.strength;
          this.bloomPass.radius = newBloomSettings.radius;
          this.bloomPass.threshold = newBloomSettings.threshold;
          (this.bloomPass as any).edgeStrength = newBloomSettings.edgeStrength;
          (this.bloomPass as any).nodeStrength = newBloomSettings.nodeStrength;
          (this.bloomPass as any).environmentStrength = newBloomSettings.environmentStrength;
          
          // Update enabled state last to avoid flashing
          if (wasEnabled !== shouldBeEnabled) {
            this.bloomPass.enabled = shouldBeEnabled;
          }
        }
      }
    }

    if (hasRenderingChanged) {
      this.currentRenderingSettings = newRendering;

      // Update background color
      if (newRendering.backgroundColor) {
        this.scene.background = new Color(newRendering.backgroundColor);
      }

      // Update lighting
      const lights = this.scene.children.filter(child => 
        child instanceof AmbientLight || child instanceof DirectionalLight
      );
      
      lights.forEach(light => {
        if (light instanceof AmbientLight) {
          light.intensity = newRendering.ambientLightIntensity;
        } else if (light instanceof DirectionalLight) {
          light.intensity = newRendering.directionalLightIntensity;
        }
      });

      // Update renderer settings
      if (this.renderer) {
        // Log settings changes that can't be updated at runtime
        if (newRendering.enableAntialiasing !== this.currentRenderingSettings?.enableAntialiasing) {
          logger.warn('Antialiasing setting can only be changed at renderer creation');
        }
        (this.renderer as any).shadowMap.enabled = newRendering.enableShadows || false;
      }
    }

    // Only log if something actually changed
    if (hasRenderingChanged) {
      logger.debug('Scene settings updated:', createDataMetadata({
        rendering: newRendering,
        bloom: {
          enabled: this.bloomPass.enabled,
          strength: this.bloomPass.strength
        }
      }));
    }
  }

  private applyLowPerformanceOptimizations(): void {
    // Optimize materials
    this.scene.traverse((object: Object3D) => {
      if (object instanceof Mesh) {
        const material = object.material as Material;
        if (material) {
          // Keep material features that affect visual quality
          material.needsUpdate = true;
          
          // Disable shadows
          (object as any).castShadow = (object as any).receiveShadow = false;
          
          // Force material update
          material.needsUpdate = true;
        }
      }
    });

    // Optimize renderer
    (this.renderer as any).shadowMap.enabled = false;
    
    // Only disable bloom at very low FPS
    if (this.bloomPass?.enabled && this.currentFps < 20) {
      // Instead of disabling bloom completely, reduce its intensity
      if (this.currentFps < 15) {
        // Only disable bloom at extremely low FPS
        logger.warn('Disabling bloom due to very low FPS', createDataMetadata({
          fps: this.currentFps.toFixed(1)
        }));
        this.bloomPass.enabled = false;
      } else {
        // Reduce bloom strength at moderately low FPS
        const reducedStrength = Math.max(0.5, this.bloomPass.strength * 0.7);
        if (this.bloomPass.strength !== reducedStrength) {
          this.bloomPass.strength = reducedStrength;
          logger.debug('Reducing bloom strength due to low FPS', createDataMetadata({
            fps: this.currentFps.toFixed(1),
            newStrength: this.bloomPass.strength
          }));
        }
      }
    }

    // Log optimization application only when FPS changes significantly
    const fpsDiff = Math.abs(this.currentFps - this.lastLoggedFps);
    if (fpsDiff >= this.FPS_LOG_THRESHOLD) {
      logger.info('Applied low performance optimizations', createDataMetadata({
        fps: this.currentFps.toFixed(1)
      }));
      this.lastLoggedFps = this.currentFps;
    }
  }
}
