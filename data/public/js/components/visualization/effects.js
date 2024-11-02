import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BLOOM_LAYER, NORMAL_LAYER } from './nodes.js';

export class EffectsManager {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        this.bloomComposer = null;
        this.finalComposer = null;
        
        // Bloom settings
        this.bloomStrength = 1.5;
        this.bloomRadius = 0.4;
        this.bloomThreshold = 0.2;

        // Hologram settings
        this.hologramGroup = new THREE.Group();
        this.scene.add(this.hologramGroup);
        this.hologramColor = 0xFFD700;
        this.hologramScale = 1;
        this.hologramOpacity = 0.1;
    }

    initPostProcessing() {
        // Create render targets
        const renderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                encoding: THREE.sRGBEncoding
            }
        );

        // Setup bloom composer
        this.bloomComposer = new EffectComposer(this.renderer, renderTarget);
        this.bloomComposer.renderToScreen = false;
        
        const renderScene = new RenderPass(this.scene, this.camera);
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.bloomStrength,
            this.bloomRadius,
            this.bloomThreshold
        );

        this.bloomComposer.addPass(renderScene);
        this.bloomComposer.addPass(bloomPass);

        // Setup final composer
        this.finalComposer = new EffectComposer(this.renderer);
        this.finalComposer.addPass(renderScene);

        // Add custom shader pass to combine bloom with scene
        const finalPass = new ShaderPass(
            new THREE.ShaderMaterial({
                uniforms: {
                    baseTexture: { value: null },
                    bloomTexture: { value: this.bloomComposer.renderTarget2.texture }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D baseTexture;
                    uniform sampler2D bloomTexture;
                    varying vec2 vUv;
                    void main() {
                        vec4 baseColor = texture2D(baseTexture, vUv);
                        vec4 bloomColor = texture2D(bloomTexture, vUv);
                        gl_FragColor = baseColor + vec4(1.0) * bloomColor;
                    }
                `,
                defines: {}
            }),
            "baseTexture"
        );
        finalPass.needsSwap = true;
        this.finalComposer.addPass(finalPass);
    }

    createHologramStructure() {
        // Clear existing hologram structure
        while (this.hologramGroup.children.length > 0) {
            const child = this.hologramGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.hologramGroup.remove(child);
        }

        // Create new hologram structure
        const hologramGeometry = new THREE.TorusGeometry(100, 3, 16, 100);
        const hologramMaterial = new THREE.MeshStandardMaterial({
            color: this.hologramColor,
            emissive: this.hologramColor,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: this.hologramOpacity,
            metalness: 0.8,
            roughness: 0.2
        });

        // Create multiple rings with different orientations
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(hologramGeometry, hologramMaterial);
            ring.rotation.x = Math.PI / 2 * i;
            ring.rotation.y = Math.PI / 4 * i;
            ring.userData.rotationSpeed = 0.002 * (i + 1);
            this.hologramGroup.add(ring);
        }
    }

    animate() {
        this.hologramGroup.children.forEach(child => {
            child.rotation.x += child.userData.rotationSpeed;
            child.rotation.y += child.userData.rotationSpeed;
        });
    }

    render() {
        // Render with bloom effect
        this.camera.layers.set(BLOOM_LAYER);
        this.bloomComposer.render();
        
        this.camera.layers.set(NORMAL_LAYER);
        this.finalComposer.render();
    }

    onResize(width, height) {
        if (this.bloomComposer) this.bloomComposer.setSize(width, height);
        if (this.finalComposer) this.finalComposer.setSize(width, height);
    }

    updateFeature(control, value) {
        switch (control) {
            // Bloom features
            case 'bloomStrength':
                this.bloomStrength = value;
                if (this.bloomComposer) {
                    this.bloomComposer.passes.forEach(pass => {
                        if (pass instanceof UnrealBloomPass) {
                            pass.strength = value;
                        }
                    });
                }
                break;
            case 'bloomRadius':
                this.bloomRadius = value;
                if (this.bloomComposer) {
                    this.bloomComposer.passes.forEach(pass => {
                        if (pass instanceof UnrealBloomPass) {
                            pass.radius = value;
                        }
                    });
                }
                break;
            case 'bloomThreshold':
                this.bloomThreshold = value;
                if (this.bloomComposer) {
                    this.bloomComposer.passes.forEach(pass => {
                        if (pass instanceof UnrealBloomPass) {
                            pass.threshold = value;
                        }
                    });
                }
                break;

            // Hologram features
            case 'hologramColor':
                this.hologramColor = value;
                this.hologramGroup.children.forEach(child => {
                    child.material.color.setHex(value);
                    child.material.emissive.setHex(value);
                });
                break;
            case 'hologramScale':
                this.hologramScale = value;
                this.hologramGroup.scale.setScalar(value);
                break;
            case 'hologramOpacity':
                this.hologramOpacity = value;
                this.hologramGroup.children.forEach(child => {
                    child.material.opacity = value;
                });
                break;
        }
    }

    dispose() {
        // Dispose bloom resources
        if (this.bloomComposer) {
            this.bloomComposer.renderTarget1.dispose();
            this.bloomComposer.renderTarget2.dispose();
        }
        if (this.finalComposer) {
            this.finalComposer.renderTarget1.dispose();
            this.finalComposer.renderTarget2.dispose();
        }

        // Dispose hologram resources
        this.hologramGroup.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}