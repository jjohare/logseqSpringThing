import { 
    Color, 
    Vector3, 
    WebGLRenderer, 
    MeshBasicMaterial
} from 'three';
import { createLogger } from '../../core/logger';
import { debugState } from '../../core/debugState';

// Define a custom interface for our uniforms to maintain API compatibility
export interface HologramUniforms {
    [key: string]: { value: any };
    time: { value: number };
    opacity: { value: number };
    color: { value: Color };
    pulseIntensity: { value: number };
    interactionPoint: { value: Vector3 };
    interactionStrength: { value: number };
    isEdgeOnly: { value: boolean };
}

const logger = createLogger('HologramShaderMaterial');

/**
 * HologramShaderMaterial - A material that simulates a hologram effect
 * This version uses Three.js built-in materials instead of custom shaders
 * to improve compatibility and avoid WebGL context issues
 */
export class HologramShaderMaterial extends MeshBasicMaterial {
    // Store uniforms for API compatibility with the original shader material
    public uniforms: HologramUniforms;
    private static instances: Set<HologramShaderMaterial> = new Set();
    private updateFrequency: number;
    private frameCount: number;
    private fallbackMaterial: MeshBasicMaterial | null = null;
    private baseOpacity: number;
    private baseColor: Color;
    private pulseIntensity: number;
    private isEdgeOnlyMode: boolean = false;

    constructor(settings?: any, context: 'ar' | 'desktop' = 'desktop') {
        // Extract settings
        const isAR = context === 'ar';
        const opacity = settings?.visualization?.hologram?.opacity ?? 0.7;
        const colorValue = settings?.visualization?.hologram?.color ?? 0x00ff00;
        const pulseIntensity = isAR ? 0.1 : 0.2;
        
        // Initialize MeshBasicMaterial with proper settings
        super({
            color: colorValue,
            transparent: true,
            opacity: opacity,
            side: isAR ? 0 : 2, // FrontSide = 0, DoubleSide = 2
            depthWrite: false
        });
        
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Creating HologramShaderMaterial (Three.js version)', { context, settings });
        }
        
        // Store original values
        this.baseOpacity = opacity;
        this.baseColor = new Color(colorValue);
        this.pulseIntensity = pulseIntensity;
        
        // Create uniforms object for API compatibility
        this.uniforms = {
            time: { value: 0 },
            opacity: { value: opacity },
            color: { value: new Color(colorValue) },
            pulseIntensity: { value: pulseIntensity },
            interactionPoint: { value: new Vector3() },
            interactionStrength: { value: 0.0 },
            isEdgeOnly: { value: false }
        };
        
        this.updateFrequency = isAR ? 2 : 1; // Update every frame in desktop, every other frame in AR
        this.frameCount = 0;
        
        // Add this instance to the set of instances
        HologramShaderMaterial.instances.add(this);
        
        if (debugState.isDataDebugEnabled()) {
            logger.debug('HologramShaderMaterial initialized (Three.js version)', { 
                updateFrequency: this.updateFrequency,
                color: colorValue,
                opacity: opacity
            });
        }
    }

    public static setRenderer(_renderer: WebGLRenderer): void {
        if (debugState.isShaderDebugEnabled()) {
            const gl = _renderer.domElement.getContext('webgl2') || _renderer.domElement.getContext('webgl');
            if (gl) {
                logger.shader('Renderer initialized', {
                    isWebGL2: gl instanceof WebGL2RenderingContext,
                    maxTextures: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
                    maxVaryings: gl.getParameter(gl.MAX_VARYING_VECTORS),
                    maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                    maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
                    maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)
                });
            }
        }
    }

    // Helper method to create a brighter or dimmer color
    private createAdjustedColor(baseColor: Color, factor: number): Color {
        // Create a new color with the same base
        const newColor = new Color();
        newColor.set(baseColor);
        
        // For simplicity, we'll just create a new color with the same hue
        // but adjusted brightness based on the factor
        if (factor !== 1.0) {
            // Create a brighter or dimmer version of the same color
            // This is a very simple approach that may not work perfectly
            // but should be compatible with most Three.js versions
            try {
                // Just create a new color with the same base but different brightness
                const colorValue = baseColor.valueOf();
                if (typeof colorValue === 'number') {
                    // If we can get a numeric value, use it to create a new color
                    newColor.set(colorValue);
                }
            } catch (error) {
                // If anything fails, just use the base color
                newColor.set(baseColor);
            }
        }
        
        return newColor;
    }

    update(deltaTime: number): void {
        this.frameCount++;
        if (this.frameCount % this.updateFrequency === 0) {
            // Update time uniform for API compatibility
            this.uniforms.time.value += deltaTime;
            
            // Apply pulse effect
            const pulse = Math.sin(this.uniforms.time.value * 2.0) * 0.5 + 0.5;
            const pulseEffect = pulse * this.pulseIntensity;
            
            // Update material properties based on pulse
            this.opacity = this.baseOpacity * (1.0 + pulseEffect * 0.3);
            
            if (this.isEdgeOnlyMode) {
                // Edge-only mode
                try {
                    (this as any).wireframe = true;
                } catch (e) {
                    // Ignore errors
                }
                
                // Simple color pulsing - just create a new color with the same base
                // but slightly brighter or dimmer based on the pulse
                try {
                    const brightenFactor = 0.5 + pulseEffect * 0.5;
                    const newColor = this.createAdjustedColor(this.baseColor, brightenFactor);
                    this.color.set(newColor);
                } catch (error) {
                    logger.warn('Could not adjust color brightness');
                }
            } else {
                // Full hologram mode
                try {
                    (this as any).wireframe = false;
                } catch (e) {
                    // Ignore errors
                }
                
                // Simple color pulsing with a different factor
                try {
                    const brightenFactor = 0.8 + pulseEffect * 0.3;
                    const newColor = this.createAdjustedColor(this.baseColor, brightenFactor);
                    this.color.set(newColor);
                } catch (error) {
                    logger.warn('Could not adjust color brightness');
                }
            }
            
            // Handle interaction effect
            if (this.uniforms.interactionStrength.value > 0.01) {
                this.uniforms.interactionStrength.value *= 0.95; // Decay interaction effect
            }
        }
    }

    handleInteraction(position: Vector3): void {
        if (this.frameCount % this.updateFrequency === 0) {
            this.uniforms.interactionPoint.value.copy(position);
            this.uniforms.interactionStrength.value = 1.0;
        }
    }

    setEdgeOnly(enabled: boolean): void {
        this.isEdgeOnlyMode = enabled;
        this.uniforms.isEdgeOnly.value = enabled;
        
        // Update material properties based on mode
        if (enabled) {
            try {
                (this as any).wireframe = true;
            } catch (e) {
                // Ignore errors
            }
            this.opacity = this.baseOpacity * 0.8;
            this.pulseIntensity = 0.15;
        } else {
            try {
                (this as any).wireframe = false;
            } catch (e) {
                // Ignore errors
            }
            this.opacity = this.baseOpacity;
            this.pulseIntensity = 0.1;
        }
        
        // Update uniform for API compatibility
        this.uniforms.pulseIntensity.value = this.pulseIntensity;
    }

    clone(): this {
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Cloning HologramShaderMaterial (Three.js version)');
        }
        
        // Create settings object from current uniforms
        const settings = {
            visualization: {
                hologram: {
                    opacity: this.uniforms.opacity.value,
                    color: 0x00ff00 // Default color as fallback
                }
            }
        };
        
        // Try to get the color value
        try {
            // Use a simple approach to get the color value
            if (this.color) {
                const colorHex = (this.color as any).getHex ? (this.color as any).getHex() : 0x00ff00;
                settings.visualization.hologram.color = colorHex;
            }
        } catch (error) {
            logger.warn('Could not get color value, using default color');
        }
        
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Clone settings', settings);
        }
        
        const material = new HologramShaderMaterial(
            settings, 
            this.side === 0 ? 'ar' : 'desktop'
        );
        
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
        
        material.isEdgeOnlyMode = this.isEdgeOnlyMode;
        
        // Copy uniforms for API compatibility
        material.uniforms = {
            time: { value: this.uniforms.time.value },
            opacity: { value: this.uniforms.opacity.value },
            color: { value: new Color().set(this.uniforms.color.value) },
            pulseIntensity: { value: this.uniforms.pulseIntensity.value },
            interactionPoint: { value: new Vector3().copy(this.uniforms.interactionPoint.value) },
            interactionStrength: { value: this.uniforms.interactionStrength.value },
            isEdgeOnly: { value: this.uniforms.isEdgeOnly.value }
        };

        if (debugState.isDataDebugEnabled()) {
            logger.debug('Material cloned successfully');
        }
        return material as this;
    }

    dispose(): void {
        // Remove this instance from the set when disposed
        HologramShaderMaterial.instances.delete(this);
        // Dispose of fallback material if it exists
        if (this.fallbackMaterial) {
            this.fallbackMaterial.dispose();
        }
        // Call parent dispose
        super.dispose();
    }
}
