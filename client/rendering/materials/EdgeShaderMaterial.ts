import * as THREE from 'three';
import { Settings } from '../../types/settings/base';

export interface EdgeUniforms {
    [key: string]: { value: any };
    time: { value: number };
    opacity: { value: number };
    color: { value: THREE.Color };
    flowSpeed: { value: number };
    flowIntensity: { value: number };
    glowStrength: { value: number };
    distanceIntensity: { value: number };
    useGradient: { value: boolean };
    gradientColorA: { value: THREE.Color };
    gradientColorB: { value: THREE.Color };
    sourcePosition: { value: THREE.Vector3 };
    targetPosition: { value: THREE.Vector3 };
}

export class EdgeShaderMaterial extends THREE.ShaderMaterial {
    declare uniforms: EdgeUniforms;
    private updateFrequency: number;
    private frameCount: number = 0;

    constructor(settings: Settings, context: 'ar' | 'desktop' = 'desktop') {
        const isAR = context === 'ar';
        
        super({
            uniforms: {
                time: { value: 0 },
                opacity: { value: settings.visualization.edges.opacity },
                color: { value: new THREE.Color(settings.visualization.edges.color) },
                flowSpeed: { value: settings.visualization.edges.flowSpeed },
                flowIntensity: { value: settings.visualization.edges.flowIntensity },
                glowStrength: { value: settings.visualization.edges.glowStrength },
                distanceIntensity: { value: settings.visualization.edges.distanceIntensity },
                useGradient: { value: settings.visualization.edges.useGradient },
                gradientColorA: { value: new THREE.Color(settings.visualization.edges.gradientColors[0]) },
                gradientColorB: { value: new THREE.Color(settings.visualization.edges.gradientColors[1]) },
                sourcePosition: { value: new THREE.Vector3() },
                targetPosition: { value: new THREE.Vector3() }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vDistance;
                const float PI = 3.14159265359;
                
                uniform vec3 sourcePosition;
                uniform vec3 targetPosition;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    
                    // Optimize distance calculation
                    vec3 edgeDir = normalize(targetPosition - sourcePosition);
                    vec3 posVector = position - sourcePosition;
                    vDistance = dot(edgeDir, normalize(posVector));
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                uniform vec3 color;
                uniform float flowSpeed;
                uniform float flowIntensity;
                uniform float glowStrength;
                uniform float distanceIntensity;
                uniform bool useGradient;
                uniform vec3 gradientColorA;
                uniform vec3 gradientColorB;
                
                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vDistance;
                
                void main() {
                    // Simplified flow calculation
                    float flow = sin(vDistance * 8.0 - time * flowSpeed) * 0.5 + 0.5;
                    flow *= flowIntensity;

                    // Optimized distance-based intensity
                    float distanceFactor = 1.0 - abs(vDistance - 0.5) * 2.0;
                    distanceFactor = pow(distanceFactor, distanceIntensity);
                    
                    // Base color with gradient
                    vec3 finalColor = useGradient ? 
                        mix(gradientColorA, gradientColorB, vDistance) : 
                        color;

                    // Add flow and glow effects
                    finalColor += flow * 0.2;
                    finalColor += (1.0 - vUv.y) * glowStrength * 0.3;
                    
                    // Apply distance factor
                    finalColor *= mix(0.5, 1.0, distanceFactor);
                    
                    gl_FragColor = vec4(finalColor, opacity * (0.7 + flow * 0.3));
                }
            `,
            transparent: true,
            side: isAR ? 0 : 2, // THREE.FrontSide = 0, THREE.DoubleSide = 2
            blending: isAR ? THREE.NormalBlending : THREE.AdditiveBlending, // Use normal blending in VR for better performance
            depthWrite: !isAR // Disable depth write in VR for better performance
        });

        // Set update frequency based on context
        this.updateFrequency = isAR ? 3 : 2; // Update less frequently in AR
    }

    update(deltaTime: number): void {
        this.frameCount++;
        if (this.frameCount % this.updateFrequency === 0) {
            this.uniforms.time.value += deltaTime;
        }
    }

    setSourceTarget(source: THREE.Vector3, target: THREE.Vector3): void {
        this.uniforms.sourcePosition.value.copy(source);
        this.uniforms.targetPosition.value.copy(target);
    }

    clone(): this {
        const material = new EdgeShaderMaterial({
            visualization: {
                edges: {
                    opacity: this.uniforms.opacity.value,
                    color: this.uniforms.color.value.clone(),
                    flowSpeed: this.uniforms.flowSpeed.value,
                    flowIntensity: this.uniforms.flowIntensity.value,
                    glowStrength: this.uniforms.glowStrength.value,
                    distanceIntensity: this.uniforms.distanceIntensity.value,
                    useGradient: this.uniforms.useGradient.value,
                    gradientColors: [
                        this.uniforms.gradientColorA.value.clone(),
                        this.uniforms.gradientColorB.value.clone()
                    ]
                } as any
            } as any
        } as Settings);
        return material as this;
    }
}