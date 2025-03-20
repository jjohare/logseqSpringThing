// Stub implementation of SceneManager to prevent conflicts with React Three Fiber
import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
import { Settings } from '../types/settings';

const logger = createLogger('SceneManager');

/**
 * IMPORTANT: This is a stub implementation of SceneManager
 * The application has been migrated to use React Three Fiber
 * This stub exists only to satisfy imports and prevent runtime errors
 */

export class SceneManager {
  private static instance: SceneManager;
  private scene: any = {};
  private camera: any = { position: { set: () => {} }, lookAt: () => {}, updateProjectionMatrix: () => {} };
  private renderer: any | null = null;
  private running: boolean = false;
  private renderCallbacks: any[] = [];
  private resizeCallbacks: any[] = [];
  private disposeCallbacks: any[] = [];

  private constructor() {
    logger.info('Using React Three Fiber for rendering - SceneManager is in compatibility mode');
  }

  public static getInstance(canvas?: HTMLCanvasElement): SceneManager {
    if (!SceneManager.instance) {
      SceneManager.instance = new SceneManager();
    }
    return SceneManager.instance;
  }

  public static cleanup(): void {
    if (SceneManager.instance) {
      logger.info('SceneManager cleanup called');
    }
  }

  // Stub methods that do nothing
  private initRenderer(canvas: HTMLCanvasElement): void {}
  private setupResizeHandler(): void {}
  public handleSettingsUpdate(settings: Settings): void {}

  public start(): void {
    if (debugState.isEnabled()) {
      logger.info('SceneManager.start() called but using React Three Fiber instead');
    }
  }

  public stop(): void {}
  private render = (): void => {};
  public addRenderCallback(callback: () => void): () => void {
    return () => {};
  }
  public addResizeCallback(callback: () => void): () => void {
    return () => {};
  }
  public dispose(): void {}
  
  // Getters
  public getScene(): any {
    return this.scene;
  }
  public getCamera(): any {
    return this.camera;
  }
  public getRenderer(): any | null {
    return this.renderer;
  }
  public isRunning(): boolean {
    return this.running;
  }
}