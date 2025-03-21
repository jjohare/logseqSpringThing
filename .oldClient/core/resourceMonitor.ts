import { createLogger } from './logger';
import { WebGLRenderer, Texture, BufferGeometry, Material } from 'three';
import { debugState } from './debugState';

const logger = createLogger('ResourceMonitor');

/**
 * ResourceMonitor - Tracks WebGL resources to help identify leaks and performance issues
 */
export class ResourceMonitor {
  private static instance: ResourceMonitor;
  
  private renderers: Set<WebGLRenderer> = new Set();
  private textures: Set<Texture> = new Set();
  private geometries: Set<BufferGeometry> = new Set();
  private materials: Set<Material> = new Set();
  
  private monitoringEnabled: boolean = false;
  private monitorInterval: any = null;
  private monitorFrequency: number = 30000; // 30 seconds (increased from 10)
  
  private constructor() {
    // Private constructor for singleton
  }
  
  public static getInstance(): ResourceMonitor {
    if (!ResourceMonitor.instance) {
      ResourceMonitor.instance = new ResourceMonitor();
    }
    return ResourceMonitor.instance;
  }
  
  /**
   * Start monitoring resources
   * @param frequency Monitoring frequency in milliseconds
   */
  public startMonitoring(frequency: number = 10000): void {
    this.monitoringEnabled = true;
    this.monitorFrequency = frequency;
    
    // Clear any existing interval
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    // Set up monitoring interval
    this.monitorInterval = setInterval(() => {
      this.logResourceUsage();
    }, this.monitorFrequency);
    
    logger.info('Resource monitoring started', {
      frequency: this.monitorFrequency
    });
    
    // Log initial state
    this.logResourceUsage();
  }
  
  /**
   * Stop monitoring resources
   */
  public stopMonitoring(): void {
    this.monitoringEnabled = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    logger.info('Resource monitoring stopped');
  }
  
  /**
   * Track a WebGL renderer
   */
  public trackRenderer(renderer: WebGLRenderer): void {
    this.renderers.add(renderer);
    logger.debug('Tracking new WebGL renderer', {
      rendererId: this.getObjectId(renderer),
      totalRenderers: this.renderers.size
    });
  }
  
  /**
   * Stop tracking a WebGL renderer
   */
  public untrackRenderer(renderer: WebGLRenderer): void {
    this.renderers.delete(renderer);
    logger.debug('Untracking WebGL renderer', {
      rendererId: this.getObjectId(renderer),
      totalRenderers: this.renderers.size
    });
  }
  
  /**
   * Track a texture
   */
  public trackTexture(texture: Texture): void {
    this.textures.add(texture);
    
    if (this.monitoringEnabled && this.textures.size % 10 === 0) {
      logger.debug('Tracking new texture', {
        textureId: this.getObjectId(texture),
        totalTextures: this.textures.size
      });
    }
  }
  
  /**
   * Stop tracking a texture
   */
  public untrackTexture(texture: Texture): void {
    this.textures.delete(texture);
    
    if (this.monitoringEnabled && this.textures.size % 10 === 0) {
      logger.debug('Untracking texture', {
        textureId: this.getObjectId(texture),
        totalTextures: this.textures.size
      });
    }
  }
  
  /**
   * Track a geometry
   */
  public trackGeometry(geometry: BufferGeometry): void {
    this.geometries.add(geometry);
    
    if (this.monitoringEnabled && this.geometries.size % 10 === 0) {
      logger.debug('Tracking new geometry', {
        geometryId: this.getObjectId(geometry),
        totalGeometries: this.geometries.size
      });
    }
  }
  
  /**
   * Stop tracking a geometry
   */
  public untrackGeometry(geometry: BufferGeometry): void {
    this.geometries.delete(geometry);
    
    if (this.monitoringEnabled && this.geometries.size % 10 === 0) {
      logger.debug('Untracking geometry', {
        geometryId: this.getObjectId(geometry),
        totalGeometries: this.geometries.size
      });
    }
  }
  
  /**
   * Track a material
   */
  public trackMaterial(material: Material): void {
    this.materials.add(material);
    
    if (this.monitoringEnabled && this.materials.size % 10 === 0) {
      logger.debug('Tracking new material', {
        materialId: this.getObjectId(material),
        materialType: this.getObjectType(material),
        totalMaterials: this.materials.size
      });
    }
  }
  
  /**
   * Stop tracking a material
   */
  public untrackMaterial(material: Material): void {
    this.materials.delete(material);
    
    if (this.monitoringEnabled && this.materials.size % 10 === 0) {
      logger.debug('Untracking material', {
        materialId: this.getObjectId(material),
        materialType: this.getObjectType(material),
        totalMaterials: this.materials.size
      });
    }
  }
  
  /**
   * Get a unique identifier for an object
   */
  private getObjectId(obj: any): string {
    // Try to get uuid if available
    if (obj && typeof obj === 'object') {
      if (obj.uuid) {
        return obj.uuid;
      }
      
      // Fall back to object's toString or a random ID
      return obj.toString() || Math.random().toString(36).substring(2, 10);
    }
    
    return 'unknown';
  }
  
  /**
   * Get the type of an object
   */
  private getObjectType(obj: any): string {
    if (obj && typeof obj === 'object') {
      if (obj.type) {
        return obj.type;
      }
      
      return obj.constructor?.name || typeof obj;
    }
    
    return typeof obj;
  }
  
  /**
   * Log current resource usage
   */
  public logResourceUsage(): void {
    // Only log detailed resource usage if performance debugging is enabled
    if (debugState.isPerformanceDebugEnabled()) {
      logger.performance('WebGL resource usage', {
        renderers: this.renderers.size,
        textures: this.textures.size,
        geometries: this.geometries.size,
        materials: this.materials.size,
        memory: this.getMemoryUsage()
      });
      
      // Check for potential issues
      this.checkForIssues();
    }
  }
  
  /**
   * Get memory usage information
   */
  private getMemoryUsage(): any {
    const memory: any = {};
    
    // Get browser memory info if available
    if ((performance as any).memory) {
      memory.totalJSHeapSize = (performance as any).memory.totalJSHeapSize;
      memory.usedJSHeapSize = (performance as any).memory.usedJSHeapSize;
      memory.jsHeapSizeLimit = (performance as any).memory.jsHeapSizeLimit;
    }
    
    return memory;
  }
  
  /**
   * Check for potential resource issues
   */
  private checkForIssues(): void {
    // Check for too many renderers
    if (this.renderers.size > 1) {
      logger.warn('Multiple WebGL renderers detected', {
        count: this.renderers.size,
        recommendation: 'Consider using a shared renderer to avoid WebGL context limits'
      });
    }
    
    // Check for high texture count
    if (this.textures.size > 100) {
      logger.warn('High texture count detected', {
        count: this.textures.size,
        recommendation: 'Consider using texture atlases or disposing unused textures'
      });
    }
    
    // Check for high geometry count
    if (this.geometries.size > 1000) {
      logger.warn('High geometry count detected', {
        count: this.geometries.size,
        recommendation: 'Consider using instanced geometries or merging geometries'
      });
    }
    
    // Check for high material count
    if (this.materials.size > 100) {
      logger.warn('High material count detected', {
        count: this.materials.size,
        recommendation: 'Consider sharing materials between objects'
      });
    }
    
    // Check for memory usage
    if ((performance as any).memory && (performance as any).memory.usedJSHeapSize > 0.8 * (performance as any).memory.jsHeapSizeLimit) {
      logger.warn('High memory usage detected', {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
        recommendation: 'Consider disposing unused resources or implementing level-of-detail'
      });
    }
  }
  
  /**
   * Dispose all tracked resources
   */
  public disposeAll(): void {
    // Dispose textures
    this.textures.forEach(texture => {
      texture.dispose();
    });
    this.textures.clear();
    
    // Dispose geometries
    this.geometries.forEach(geometry => {
      geometry.dispose();
    });
    this.geometries.clear();
    
    // Dispose materials
    this.materials.forEach(material => {
      material.dispose();
    });
    this.materials.clear();
    
    // Dispose renderers
    this.renderers.forEach(renderer => {
      renderer.dispose();
    });
    this.renderers.clear();
    
    logger.info('All tracked resources disposed');
  }
}

// Export singleton instance
export const resourceMonitor = ResourceMonitor.getInstance(); 