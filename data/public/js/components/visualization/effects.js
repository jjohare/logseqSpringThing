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
        
        // Enhanced bloom settings from older version
        this.bloomStrength = 2.0;
        this.bloomRadius = 0.5;
        this.bloomThreshold = 0.1;

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

        // Setup bloom composer with enhanced settings from older version
        this.bloomComposer = new EffectComposer(this.renderer, renderTarget);
        this.bloomComposer.renderToScreen = false;
        
        const renderScene = new RenderPass(this.scene, this.camera);
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.bloomStrength,
            this.bloomRadius,
            this.bloomThreshold
        );

        // Apply enhanced bloom settings
        bloomPass.threshold = 0;
        bloomPass.strength = 3.0;
        bloomPass.radius = 1;

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

        // Create rotating rings from current version
        const ringGeometry = new THREE.TorusGeometry(100, 3, 16, 100);
        const ringMaterial = new THREE.MeshStandardMaterial({
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
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2 * i;
            ring.rotation.y = Math.PI / 4 * i;
            ring.userData.rotationSpeed = 0.002 * (i + 1);
            this.hologramGroup.add(ring);
        }

        // Add Buckminster Fullerene from older version
        const buckyGeometry = new THREE.IcosahedronGeometry(40 * this.hologramScale, 1);
        const buckyMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const buckySphere = new THREE.Mesh(buckyGeometry, buckyMaterial);
        buckySphere.userData.rotationSpeed = 0.0001;
        buckySphere.layers.enable(1);
        this.hologramGroup.add(buckySphere);

        // Add Geodesic Dome from older version
        const geodesicGeometry = new THREE.IcosahedronGeometry(30 * this.hologramScale, 1);
        const geodesicMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const geodesicDome = new THREE.Mesh(geodesicGeometry, geodesicMaterial);
        geodesicDome.userData.rotationSpeed = 0.0002;
        geodesicDome.layers.enable(1);
        this.hologramGroup.add(geodesicDome);

        // Add Normal Triangle Sphere from older version
        const triangleGeometry = new THREE.SphereGeometry(20 * this.hologramScale, 32, 32);
        const triangleMaterial = new THREE.MeshBasicMaterial({
            color: this.hologramColor,
            wireframe: true,
            transparent: true,
            opacity: this.hologramOpacity
        });
        const triangleSphere = new THREE.Mesh(triangleGeometry, triangleMaterial);
        triangleSphere.userData.rotationSpeed = 0.0003;
        triangleSphere.layers.enable(1);
        this.hologramGroup.add(triangleSphere);
    }

    animate() {
        // Animate all hologram elements
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
