import { 
    Vector3, 
    WebGLRenderer, 
    MeshBasicMaterial
} from 'three';
import { createLogger } from '../../core/logger';
import { debugState } from '../../core/debugState';

const logger = createLogger('EdgeShaderMaterial');

/**
 * EdgeShaderMaterial - A material for rendering edges in the graph
 * This version uses Three.js built-in materials instead of custom shaders
 * to improve compatibility and avoid WebGL context issues
 */
export class EdgeShaderMaterial extends MeshBasicMaterial {
    private static instances: Set<EdgeShaderMaterial> = new Set();
    private fallbackMaterial: MeshBasicMaterial | null = null;
    private baseOpacity: number;
    private updateFrequency: number;
    private frameCount: number;
    
    // Store time for animation
    private time: number = 0;

    constructor(settings?: any) {
        // Extract settings
        const opacity = settings?.visualization?.edges?.opacity ?? 0.7;
        const colorValue = settings?.visualization?.edges?.color ?? 0x4080ff;
        
        // Initialize MeshBasicMaterial with proper settings
        super({
            color: colorValue,
            transparent: true,
            opacity: opacity,
            side: 2, // DoubleSide = 2
            depthWrite: false
        });
        
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Creating EdgeShaderMaterial (Three.js version)', { settings });
        }
        
        // Try to set wireframe if available
        try {
            (this as any).wireframe = true;
        } catch (e) {
            logger.warn('Could not set wireframe property on MeshBasicMaterial');
        }
        
        // Store original values
        this.baseOpacity = opacity;
        
        this.updateFrequency = 1; // Update every frame
        this.frameCount = 0;

        // Add this instance to the set of instances
        EdgeShaderMaterial.instances.add(this);

        if (debugState.isDataDebugEnabled()) {
            logger.debug('EdgeShaderMaterial initialized (Three.js version)', { 
                color: colorValue,
                opacity: opacity
            });
        }
    }

    public static setRenderer(_renderer: WebGLRenderer): void {
        if (debugState.isShaderDebugEnabled()) {
            logger.shader('Renderer set for EdgeShaderMaterial');
        }
    }

    update(deltaTime: number): void {
        this.frameCount++;
        if (this.frameCount % this.updateFrequency === 0) {
            // Update time for animation
            this.time += deltaTime;
            
            // Simple pulsing effect
            const pulse = Math.sin(this.time * 1.5) * 0.1 + 0.9;
            this.opacity = this.baseOpacity * pulse;
        }
    }

    setSourceTarget(_source: Vector3, _target: Vector3): void {
        // This method is kept for API compatibility
        // In the simplified version, we don't need to do anything here
    }

    clone(): this {
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Cloning EdgeShaderMaterial (Three.js version)');
        }
        
        // Create settings object from current properties
        const settings = {
            visualization: {
                edges: {
                    opacity: this.opacity,
                    color: 0x4080ff // Default color as fallback
                }
            }
        };
        
        // Try to get the color value
        try {
            // Use a simple approach to get the color value
            if (this.color) {
                const colorHex = (this.color as any).getHex ? (this.color as any).getHex() : 0x4080ff;
                settings.visualization.edges.color = colorHex;
            }
        } catch (error) {
            logger.warn('Could not get color value, using default color');
        }
        
        const material = new EdgeShaderMaterial(settings);
        
        // Copy current state
        try {
            (material as any).wireframe = (this as any).wireframe || false;
        } catch (e) {
            // Ignore errors
        }
        material.opacity = this.opacity;
        try {
            material.color.set(this.color);
        } catch (error) {
            logger.warn('Could not copy color from original material');
        }
        
        material.time = this.time;
        material.frameCount = this.frameCount;
        
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Material cloned successfully');
        }
        return material as this;
    }

    dispose(): void {
        // Remove this instance from the set when disposed
        EdgeShaderMaterial.instances.delete(this);
        // Dispose of fallback material if it exists
        if (this.fallbackMaterial) {
            this.fallbackMaterial.dispose();
        }
        // Call parent dispose
        super.dispose();
    }
}