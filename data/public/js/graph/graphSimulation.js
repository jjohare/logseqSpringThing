import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

/**
 * GraphSimulation class for managing force-directed graph layouts.
 * Supports both CPU and GPU-based simulations.
 */
export class GraphSimulation {
    /**
     * Create a new GraphSimulation instance.
     * @param {THREE.WebGLRenderer} renderer - The Three.js renderer
     * @param {Array} nodes - Array of node objects
     * @param {Array} edges - Array of edge objects
     * @param {string} simulationType - The simulation type ('cpu' or 'remote')
     */
    constructor(renderer, nodes, edges, simulationType = 'cpu') {
        this.renderer = renderer;
        this.nodes = nodes;
        this.edges = edges;
        this.simulationType = simulationType; // 'cpu' or 'remote'
        this.TRANSLATION_SPEED = 0.1;
        this.ROTATION_SPEED = 0.01;

        // Simulation parameters
        this.params = {
            iterations: 100,
            repulsion: 1.0,
            attraction: 0.01,
            gravity: 0.05,
            damping: 0.85
        };

        this.gpuCompute = null;
        this.positionVariable = null;
        this.velocityVariable = null;
        this.edgeTexture = null;

        if (this.renderer && this.renderer.capabilities.isWebGL2 && this.simulationType === 'cpu') {
            this.initGPUCompute();
        }
    }

    /**
     * Initialize GPU computation for the simulation.
     */
    initGPUCompute() {
        try {
            const width = this.nodes.length;
            this.gpuCompute = new GPUComputationRenderer(width, 1, this.renderer);

            const dtPosition = this.gpuCompute.createTexture();
            const dtVelocity = this.gpuCompute.createTexture();

            this.fillPositionTexture(dtPosition);
            this.fillVelocityTexture(dtVelocity);
            this.createEdgeTexture();

            this.positionVariable = this.gpuCompute.addVariable('texturePosition', this.getPositionShader(), dtPosition);
            this.velocityVariable = this.gpuCompute.addVariable('textureVelocity', this.getVelocityShader(), dtVelocity);

            this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
            this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);

            const positionUniforms = this.positionVariable.material.uniforms;
            const velocityUniforms = this.velocityVariable.material.uniforms;

            positionUniforms['delta'] = { value: 0 };
            velocityUniforms['delta'] = { value: 0 };
            velocityUniforms['repulsion'] = { value: this.params.repulsion };
            velocityUniforms['attraction'] = { value: this.params.attraction };
            velocityUniforms['gravity'] = { value: this.params.gravity };
            velocityUniforms['damping'] = { value: this.params.damping };
            velocityUniforms['edgeTexture'] = { value: this.edgeTexture };
            velocityUniforms['edgeCount'] = { value: this.edges.length };

            const error = this.gpuCompute.init();
            if (error !== null) {
                console.error(`GPUComputationRenderer error: ${error}`);
                this.simulationType = 'cpu'; // Fallback to CPU
            }
        } catch (error) {
            console.error('Error initializing GPU computation:', error);
            this.simulationType = 'cpu'; // Fallback to CPU
        }
    }

    /**
     * Create a texture to store edge data for GPU computation.
     */
    createEdgeTexture() {
        const data = new Float32Array(this.edges.length * 4);
        for (let i = 0; i < this.edges.length; i++) {
            const edge = this.edges[i];
            const sourceIndex = this.nodes.findIndex(node => node.id === edge.source);
            const targetIndex = this.nodes.findIndex(node => node.id === edge.target);
            data[i * 4] = sourceIndex;
            data[i * 4 + 1] = targetIndex;
            data[i * 4 + 2] = 0; // Unused
            data[i * 4 + 3] = 0; // Unused
        }
        this.edgeTexture = new THREE.DataTexture(data, this.edges.length, 1, THREE.RGBAFormat, THREE.FloatType);
        this.edgeTexture.needsUpdate = true;
    }

    /**
     * Fill the position texture with initial node positions.
     * @param {THREE.DataTexture} texture - The texture to fill
     */
    fillPositionTexture(texture) {
        const theArray = texture.image.data;
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const stride = i * 4;
            theArray[stride] = node.x;
            theArray[stride + 1] = node.y;
            theArray[stride + 2] = node.z;
            theArray[stride + 3] = 1;
        }
    }

    /**
     * Fill the velocity texture with initial zero velocities.
     * @param {THREE.DataTexture} texture - The texture to fill
     */
    fillVelocityTexture(texture) {
        const theArray = texture.image.data;
        for (let i = 0; i < this.nodes.length; i++) {
            const stride = i * 4;
            theArray[stride] = 0;
            theArray[stride + 1] = 0;
            theArray[stride + 2] = 0;
            theArray[stride + 3] = 1;
        }
    }

    /**
     * Get the GLSL shader code for position updates.
     * @returns {string} The shader code
     */
    getPositionShader() {
        return `
            uniform float delta;
            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec4 position = texture2D(texturePosition, uv);
                vec4 velocity = texture2D(textureVelocity, uv);
                position.xyz += velocity.xyz * delta;
                gl_FragColor = position;
            }
        `;
    }

    /**
     * Get the GLSL shader code for velocity updates.
     * @returns {string} The shader code
     */
    getVelocityShader() {
        return `
            uniform float delta;
            uniform float repulsion;
            uniform float attraction;
            uniform float gravity;
            uniform float damping;
            uniform sampler2D edgeTexture;
            uniform int edgeCount;

            void main() {
                vec2 uv = gl_FragCoord.xy / resolution.xy;
                vec4 position = texture2D(texturePosition, uv);
                vec4 velocity = texture2D(textureVelocity, uv);

                vec3 force = vec3(0.0);

                // Repulsion
                for (float y = 0.0; y < 1.0; y += 1.0 / float(${this.nodes.length})) {
                    vec4 otherPosition = texture2D(texturePosition, vec2(0.5, y));
                    vec3 diff = position.xyz - otherPosition.xyz;
                    float dist = length(diff);
                    if (dist > 0.0 && dist < 50.0) {
                        force += normalize(diff) * repulsion / (dist * dist);
                    }
                }

                // Attraction (edges)
                for (int i = 0; i < ${this.edges.length}; i++) {
                    vec4 edge = texture2D(edgeTexture, vec2(float(i) / float(${this.edges.length}), 0.5));
                    float sourceIndex = edge.x;
                    float targetIndex = edge.y;
                    float currentIndex = float(gl_FragCoord.x);

                    if (currentIndex == sourceIndex || currentIndex == targetIndex) {
                        vec4 sourcePos = texture2D(texturePosition, vec2(sourceIndex / resolution.x, 0.5));
                        vec4 targetPos = texture2D(texturePosition, vec2(targetIndex / resolution.x, 0.5));
                        vec3 diff = targetPos.xyz - sourcePos.xyz;
                        float dist = length(diff);
                        vec3 attractionForce = normalize(diff) * attraction * dist;
                        
                        if (currentIndex == sourceIndex) {
                            force += attractionForce;
                        } else {
                            force -= attractionForce;
                        }
                    }
                }

                // Gravity towards center
                force += -normalize(position.xyz) * gravity;

                velocity.xyz = (velocity.xyz + force * delta) * damping;

                gl_FragColor = velocity;
            }
        `;
    }

    /**
     * Compute the simulation for one time step.
     * @param {number} deltaTime - The time step
     */
    compute(deltaTime) {
        if (this.simulationType === 'gpu') {
            this.computeGPU(deltaTime);
        } else if (this.simulationType === 'cpu') {
            this.computeCPU(deltaTime);
        }
    }

    /**
     * Compute the simulation on the GPU.
     * @param {number} deltaTime - The time step
     */
    computeGPU(deltaTime) {
        if (this.gpuCompute) {
            this.positionVariable.material.uniforms['delta'].value = deltaTime;
            this.velocityVariable.material.uniforms['delta'].value = deltaTime;
            this.gpuCompute.compute();
            this.updateNodePositions();
        } else {
            console.warn('GPUComputationRenderer not initialized. Falling back to CPU simulation.');
            this.simulationType = 'cpu';
            this.computeCPU(deltaTime);
        }
    }

    /**
     * Compute the simulation on the CPU.
     * @param {number} deltaTime - The time step
     */
    computeCPU(deltaTime) {
        for (let iteration = 0; iteration < this.params.iterations; iteration++) {
            this.applyForces(deltaTime);
            this.updatePositions(deltaTime);
        }
    }

    /**
     * Apply forces to nodes in CPU simulation.
     * @param {number} deltaTime - The time step
     */
    applyForces(deltaTime) {
        const nodes = this.nodes;
        const edges = this.edges;
        const repulsion = this.params.repulsion;
        const attraction = this.params.attraction;

        // Reset forces
        nodes.forEach(node => {
            node.force = new THREE.Vector3(0, 0, 0);
        });

        // Apply repulsion between nodes
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const nodeA = nodes[i];
                const nodeB = nodes[j];
                const dx = nodeB.x - nodeA.x;
                const dy = nodeB.y - nodeA.y;
                const dz = nodeB.z - nodeA.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (distance < 1e-6) continue;
                const forceMagnitude = repulsion / (distance * distance);
                const force = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(forceMagnitude);
                nodeA.force.sub(force);
                nodeB.force.add(force);
            }
        }

        // Apply attraction along edges
        edges.forEach(edge => {
            const source = nodes.find(node => node.id === edge.source);
            const target = nodes.find(node => node.id === edge.target);
            if (source && target) {
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const dz = target.z - source.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (distance < 1e-6) return;
                const forceMagnitude = attraction * distance;
                const force = new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(forceMagnitude);
                source.force.add(force);
                target.force.sub(force);
            }
        });

        // Apply gravity towards center
        nodes.forEach(node => {
            const gravity = new THREE.Vector3(-node.x, -node.y, -node.z).normalize().multiplyScalar(this.params.gravity);
            node.force.add(gravity);
        });

        // Apply damping and update velocities
        nodes.forEach(node => {
            node.vx = (node.vx || 0) * this.params.damping;
            node.vy = (node.vy || 0) * this.params.damping;
            node.vz = (node.vz || 0) * this.params.damping;

            node.vx += node.force.x * deltaTime;
            node.vy += node.force.y * deltaTime;
            node.vz += node.force.z * deltaTime;
        });
    }

    /**
     * Update node positions in CPU simulation.
     * @param {number} deltaTime - The time step
     */
    updatePositions(deltaTime) {
        this.nodes.forEach(node => {
            node.x += (node.vx || 0) * deltaTime;
            node.y += (node.vy || 0) * deltaTime;
            node.z += (node.vz || 0) * deltaTime;
        });
    }

    /**
     * Update node positions from GPU computation results.
     */
    updateNodePositions() {
        const positions = this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
        const posArray = new Float32Array(4 * this.nodes.length);
        this.renderer.readRenderTargetPixels(positions, 0, 0, this.nodes.length, 1, posArray);

        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const stride = i * 4;
            node.x = posArray[stride];
            node.y = posArray[stride + 1];
            node.z = posArray[stride + 2];
        }
    }

    /**
     * Set the simulation type (CPU or GPU or remote).
     * @param {string} type - The simulation type ('cpu', 'gpu', or 'remote')
     */
    setSimulationType(type) {
        if (type === 'gpu') {
            if (this.renderer.capabilities.isWebGL2) {
                this.simulationType = 'gpu';
                this.initGPUCompute();
            } else {
                console.warn('GPU not supported. Falling back to CPU simulation.');
                this.simulationType = 'cpu';
                this.initCPUCompute();
            }
        } else if (type === 'cpu') {
            this.simulationType = 'cpu';
            this.disposeGPU();
            // Ensure CPU simulation is ready
        } else if (type === 'remote') {
            this.simulationType = 'remote';
            this.disposeGPU();
            // Remote simulation will update positions from server
        } else {
            console.warn(`Unknown simulation type: ${type}`);
        }

        console.log(`Simulation type set to: ${this.simulationType}`);
    }

    /**
     * Set simulation parameters.
     * @param {Object} params - The parameters to set
     */
    setSimulationParameters(params) {
        Object.assign(this.params, params);
        if (this.gpuCompute) {
            const velocityUniforms = this.velocityVariable.material.uniforms;
            velocityUniforms['repulsion'].value = this.params.repulsion;
            velocityUniforms['attraction'].value = this.params.attraction;
            velocityUniforms['gravity'].value = this.params.gravity;
            velocityUniforms['damping'].value = this.params.damping;
        }
    }

    /**
     * Update node positions from server data in remote simulation mode.
     * @param {Array} serverNodes - Array of node objects from the server
     */
    updatePositionsFromServer(serverNodes) {
        for (let i = 0; i < this.nodes.length; i++) {
            const serverNode = serverNodes.find(n => n.id === this.nodes[i].id);
            if (serverNode) {
                this.nodes[i].x = serverNode.x;
                this.nodes[i].y = serverNode.y;
                this.nodes[i].z = serverNode.z;
            }
        }
    }

    /**
     * Dispose GPU-related resources.
     */
    dispose() {
        this.disposeGPU();
    }

    /**
     * Dispose GPU-related resources.
     */
    disposeGPU() {
        if (this.gpuCompute) {
            this.gpuCompute.dispose();
            this.gpuCompute = null;
        }
        if (this.edgeTexture) {
            this.edgeTexture.dispose();
            this.edgeTexture = null;
        }
    }
}
