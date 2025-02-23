import { 
    ShaderMaterial, 
    Color, 
    Vector3, 
    AdditiveBlending, 
    WebGLRenderer, 
    MeshBasicMaterial
} from 'three';
import { createLogger } from '../../core/logger';
import { debugState } from '../../core/debugState';

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

// Three.js side constants
const FRONT_SIDE = 0;  // THREE.FrontSide
const DOUBLE_SIDE = 2; // THREE.DoubleSide

export class HologramShaderMaterial extends ShaderMaterial {
    declare uniforms: HologramUniforms;
    private static renderer: WebGLRenderer | null = null;
    private static instances: Set<HologramShaderMaterial> = new Set();
    private updateFrequency: number;
    private frameCount: number;
    private fallbackMaterial: MeshBasicMaterial | null = null;
    public wireframe = false;

    private validateUniforms(): boolean {
        if (!debugState.isShaderDebugEnabled()) return true;

        const uniformErrors: string[] = [];
        
        // Check each uniform
        Object.entries(this.uniforms).forEach(([name, uniform]) => {
            if (uniform.value === undefined || uniform.value === null) {
                uniformErrors.push(`Uniform '${name}' has no value`);
            } else if (uniform.value instanceof Vector3 && 
                      (isNaN(uniform.value.x) || isNaN(uniform.value.y) || isNaN(uniform.value.z))) {
                uniformErrors.push(`Uniform '${name}' has invalid Vector3 value`);
            } else if (uniform.value instanceof Color) {
                const [r, g, b] = uniform.value.toArray();
                if (isNaN(r) || isNaN(g) || isNaN(b)) {
                    uniformErrors.push(`Uniform '${name}' has invalid Color value: ${(uniform.value as any).getHexString()}`);
                }
            } else if (typeof uniform.value === 'number' && 
                      (isNaN(uniform.value) || !isFinite(uniform.value))) {
                uniformErrors.push(`Uniform '${name}' has invalid number value`);
            }
        });

        if (uniformErrors.length > 0) {
            logger.shader('Uniform validation failed', { errors: uniformErrors });
            return false;
        }

        return true;
    }

    private checkWebGLVersion(renderer: WebGLRenderer): boolean {
        const gl = renderer.domElement.getContext('webgl2') || renderer.domElement.getContext('webgl');
        const isWebGL2 = gl instanceof WebGL2RenderingContext;
        
        if (debugState.isShaderDebugEnabled()) {
            logger.shader('WebGL context check', {
                version: isWebGL2 ? '2.0' : '1.0',
                glslVersion: (this as any).glslVersion ?? 'none'
            });
        }
        return isWebGL2;
    }

    constructor(settings?: any, context: 'ar' | 'desktop' = 'desktop') {
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Creating HologramShaderMaterial', { context, settings });
        }
        const isAR = context === 'ar';
        super({
            uniforms: {
                time: { value: 0 },
                opacity: { value: settings?.visualization?.hologram?.opacity ?? 1.0 },
                color: { value: new Color(settings?.visualization?.hologram?.color ?? 0x00ff00) },
                pulseIntensity: { value: isAR ? 0.1 : 0.2 },
                interactionPoint: { value: new Vector3() },
                interactionStrength: { value: 0.0 },
                isEdgeOnly: { value: false }
            },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                void main() {
                    vUv = uv;  // Pass UV coordinates to fragment shader
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform float time;
                uniform float opacity;
                uniform vec3 color;
                uniform float pulseIntensity;
                uniform vec3 interactionPoint;
                uniform float interactionStrength;
                uniform bool isEdgeOnly;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;

                void main() {
                    // Simplified pulse calculation
                    float pulse = sin(time * 5.0) * 0.5 + 0.5;  // Increased frequency for better visual effect
                    
                    // Only calculate interaction if strength is significant
                    float interaction = 0.0;
                    if (interactionStrength > 0.01) {
                        float dist = length(vPosition - interactionPoint);
                        interaction = interactionStrength * (1.0 - smoothstep(0.0, 2.0, dist));
                    }
                    
                    // Calculate fresnel effect for edge glow
                    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
                    float fresnel = pow(1.0 - max(0.0, dot(viewDirection, vNormal)), 2.0);
                    
                    float alpha;
                    if (isEdgeOnly) {
                        alpha = opacity * (0.8 + pulse * pulseIntensity + interaction + fresnel * 0.5);
                        vec3 edgeColor = color + vec3(0.1) * pulse; // Reduced edge brightness
                        gl_FragColor = vec4(edgeColor, clamp(alpha, 0.0, 1.0));
                    } else {
                        alpha = opacity * (0.5 + pulse * pulseIntensity + interaction + fresnel * 0.3);
                        vec3 finalColor = color + vec3(0.05) * fresnel; // Slight color variation on edges
                        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
                    }
                }
            `,
            transparent: true,
            side: isAR ? FRONT_SIDE : DOUBLE_SIDE,
            blending: AdditiveBlending,
            wireframe: isAR ? false : true,  // Disable wireframe in AR for better performance
            wireframeLinewidth: 1,
            defines: { USE_UV: '', USE_NORMAL: '' },  // Ensure UV coordinates and normals are available
            glslVersion: '300 es'  // Use modern GLSL version
        });

        this.updateFrequency = isAR ? 2 : 1; // Update every frame in desktop, every other frame in AR
        this.frameCount = 0;
        
        // Add this instance to the set of instances
        HologramShaderMaterial.instances.add(this);
        
        if (debugState.isDataDebugEnabled()) {
            logger.debug('HologramShaderMaterial initialized', { updateFrequency: this.updateFrequency });
        }

        // If renderer is already set, compile shader
        if (HologramShaderMaterial.renderer) {
            try {
                if (debugState.isShaderDebugEnabled()) {
                    logger.shader('Attempting shader compilation', {
                        context,
                        hasRenderer: true,
                        webgl2: this.checkWebGLVersion(HologramShaderMaterial.renderer)
                    });
                }

                // Validate uniforms before compilation
                if (!this.validateUniforms()) {
                    throw new Error('Uniform validation failed');
                }

                this.needsUpdate = true;
                // Force immediate compilation
                this.needsUpdate = true;
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error : new Error(String(error));
                const errorStack = error instanceof Error ? error.stack : undefined;
                if (debugState.isShaderDebugEnabled()) {
                    logger.shader('Shader compilation failed', {
                        error: errorMessage,
                        stack: errorStack,
                        context
                    });
                }

                // Create fallback material
                this.fallbackMaterial = new MeshBasicMaterial({
                    color: settings?.visualization?.hologram?.color ?? 0x00ff00,
                    wireframe: true,
                    transparent: this.transparent,
                    opacity: settings?.visualization?.hologram?.opacity ?? 0.5
                });
                // Copy necessary properties
                this.needsUpdate = true;
                this.side = isAR ? FRONT_SIDE : DOUBLE_SIDE;
                this.transparent = true;
            }
        }
    }

    public static setRenderer(renderer: WebGLRenderer): void {
        HologramShaderMaterial.renderer = renderer;
        
        if (debugState.isShaderDebugEnabled()) {
            const gl = renderer.domElement.getContext('webgl2') || renderer.domElement.getContext('webgl');
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

        // Force shader compilation for all instances
        HologramShaderMaterial.instances.forEach(async instance => {
            try {
                if (!instance.validateUniforms()) {
                    logger.shader('Skipping recompilation due to invalid uniforms');
                    return;
                }

                instance.needsUpdate = true;
                instance.needsUpdate = true;
                
                // If we had a fallback material and compilation succeeded, remove it
                if (instance.fallbackMaterial) {
                    instance.fallbackMaterial.dispose();
                    instance.fallbackMaterial = null;
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error : new Error(String(error));
                const errorStack = error instanceof Error ? error.stack : undefined;
                if (debugState.isShaderDebugEnabled()) {
                    logger.shader('Shader recompilation failed', {
                        error: errorMessage,
                        stack: errorStack
                    });
                }
                // Create fallback material if we don't have one
                if (!instance.fallbackMaterial) {
                    instance.fallbackMaterial = new MeshBasicMaterial({
                        color: instance.uniforms.color.value,
                        wireframe: instance.wireframe,
                        transparent: true,
                        opacity: instance.uniforms.opacity.value,
                        side: instance.side
                    });
                }
            }
        });
    }

    update(deltaTime: number): void {
        this.frameCount++;
        if (this.frameCount % this.updateFrequency === 0) {
            const oldTime = this.uniforms.time.value;
            this.uniforms.time.value += deltaTime;
            
            if (debugState.isShaderDebugEnabled() && 
                (isNaN(this.uniforms.time.value) || !isFinite(this.uniforms.time.value))) {
                logger.shader('Invalid time value detected', {
                    oldTime,
                    deltaTime,
                    newTime: this.uniforms.time.value
                });
                this.uniforms.time.value = 0;
            }

            if (this.uniforms.interactionStrength.value > 0.01) {
                this.uniforms.interactionStrength.value *= 0.95; // Decay interaction effect
                this.validateUniforms(); // Check uniforms after update
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
        this.uniforms.isEdgeOnly.value = enabled;
        // Increase pulse intensity for better visibility in wireframe mode
        this.uniforms.pulseIntensity.value = enabled ? (this.side === 0 ? 0.15 : 0.3) : (this.side === 0 ? 0.1 : 0.2);
    }

    clone(): this {
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Cloning HologramShaderMaterial');
        }
        // Create settings object from current uniforms
        const settings = {
            visualization: {
                hologram: {
                    opacity: this.uniforms.opacity.value,
                    color: '#' + (this.uniforms.color.value as any).getHexString()
                }
            }
        };
        if (debugState.isDataDebugEnabled()) {
            logger.debug('Clone settings', settings);
        }
        const material = new HologramShaderMaterial(settings, this.side === 0 ? 'ar' : 'desktop');
        material.uniforms = {
            time: { value: this.uniforms.time.value },
            opacity: { value: this.uniforms.opacity.value },
            color: { value: this.uniforms.color.value.clone() },
            pulseIntensity: { value: this.uniforms.pulseIntensity.value },
            interactionPoint: { value: this.uniforms.interactionPoint.value.clone() },
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
