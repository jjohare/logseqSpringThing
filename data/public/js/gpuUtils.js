import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

/**
 * Check if GPU acceleration is available
 * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
 * @returns {boolean} True if GPU acceleration is available, false otherwise
 */
export function isGPUAvailable(renderer) {
    try {
        const gpuCompute = new GPUComputationRenderer(1, 1, renderer);
        return gpuCompute.isSupported;
    } catch (error) {
        console.warn('GPU computation not available:', error);
        return false;
    }
}

/**
 * Initialize GPU computation renderer
 * @param {number} width - Width of the computation texture
 * @param {number} height - Height of the computation texture
 * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
 * @returns {GPUComputationRenderer|null} The GPU computation renderer or null if not supported
 */
export function initGPUCompute(width, height, renderer) {
    try {
        const gpuCompute = new GPUComputationRenderer(width, height, renderer);
        if (!gpuCompute.isSupported) {
            console.error('GPUComputationRenderer is not supported on this device');
            return null;
        }
        return gpuCompute;
    } catch (error) {
        console.error('Error initializing GPUComputationRenderer:', error);
        return null;
    }
}

/**
 * Create a data texture for GPU computation
 * @param {GPUComputationRenderer} gpuCompute - The GPU computation renderer
 * @param {Float32Array} data - The data to fill the texture
 * @returns {THREE.DataTexture} The created data texture
 */
export function createDataTexture(gpuCompute, data) {
    const texture = gpuCompute.createTexture();
    texture.image.data.set(data);
    return texture;
}

/**
 * Create the edge texture for GPU computation
 * @param {number} width - Width of the texture
 * @param {number} height - Height of the texture
 * @param {Array} edges - Array of edge objects
 * @param {Array} nodes - Array of node objects
 * @returns {THREE.DataTexture} The created edge texture
 */
export function createEdgeTexture(width, height, edges, nodes) {
    const data = new Float32Array(width * height * 4);
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const sourceIndex = nodes.findIndex(n => n.name === edge.source);
        const targetIndex = nodes.findIndex(n => n.name === edge.target);
        data[i * 4] = sourceIndex;
        data[i * 4 + 1] = targetIndex;
        data[i * 4 + 2] = edge.weight || 1.0;
        data[i * 4 + 3] = 1;
    }
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
}

/**
 * Get the GLSL shader code for position updates
 * @returns {string} GLSL shader code for position updates
 */
export function getPositionShader() {
    return `
        uniform float delta;
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec4 pos = texture2D(texturePosition, uv);
            vec4 vel = texture2D(textureVelocity, uv);
            // Update position based on velocity
            pos.xyz += vel.xyz * delta;
            gl_FragColor = pos;
        }
    `;
}

/**
 * Get the GLSL shader code for velocity updates
 * @param {number} width - Width of the computation texture
 * @param {number} height - Height of the computation texture
 * @param {number} edgeCount - Number of edges in the graph
 * @returns {string} GLSL shader code for velocity updates
 */
export function getVelocityShader(width, height, edgeCount) {
    return `
        uniform float time;
        uniform float delta;
        uniform sampler2D edgeTexture;
        uniform float nodeCount;
        uniform float edgeCount;
        uniform float repulsionStrength;
        uniform float attractionStrength;
        uniform float maxSpeed;
        uniform float damping;
        uniform float centeringForce;
        uniform float edgeDistance;

        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec4 pos = texture2D(texturePosition, uv);
            vec4 vel = texture2D(textureVelocity, uv);
            
            vec3 force = vec3(0.0);
            
            // Repulsive force
            for (float y = 0.0; y < 1.0; y += 1.0 / ${height}.0) {
                for (float x = 0.0; x < 1.0; x += 1.0 / ${width}.0) {
                    vec3 otherPos = texture2D(texturePosition, vec2(x, y)).xyz;
                    vec3 diff = pos.xyz - otherPos;
                    float dist = length(diff);
                    if (dist > 0.0001 && dist < 50.0) {
                        force += normalize(diff) * repulsionStrength / (dist * dist);
                    }
                }
            }
            
            // Attractive force (edges)
            for (float i = 0.0; i < ${edgeCount}.0; i += 1.0) {
                vec4 edge = texture2D(edgeTexture, vec2((i + 0.5) / ${width}.0, 0.5 / ${height}.0));
                if (edge.x == gl_FragCoord.x || edge.y == gl_FragCoord.x) {
                    vec3 otherPos = texture2D(texturePosition, vec2(
                        edge.x == gl_FragCoord.x ? edge.y : edge.x,
                        0.5
                    ) / resolution.xy).xyz;
                    vec3 diff = otherPos - pos.xyz;
                    float dist = length(diff);
                    force += normalize(diff) * attractionStrength * edge.z * (dist - edgeDistance);
                }
            }
            
            // Centering force to prevent drift
            force += -pos.xyz * centeringForce;
            
            // Update velocity
            vel.xyz = vel.xyz + force * delta;
            
            // Limit speed
            float speed = length(vel.xyz);
            if (speed > maxSpeed) {
                vel.xyz = normalize(vel.xyz) * maxSpeed;
            }
            
            // Apply damping
            vel.xyz *= damping;

            // Check for NaN
            if (isnan(vel.x) || isnan(vel.y) || isnan(vel.z)) {
                vel.xyz = vec3(0.0);
            }

            gl_FragColor = vel;
        }
    `;
}
