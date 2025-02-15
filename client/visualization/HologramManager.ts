import {
    Scene,
    Group,
    Mesh,
    Vector3,
    WebGLRenderer,
    InstancedMesh,
    Matrix4
} from 'three';
import { Settings } from '../types/settings';
import { GeometryFactory } from '../rendering/factories/GeometryFactory';
import { MaterialFactory } from '../rendering/factories/MaterialFactory';
import { HologramShaderMaterial } from '../rendering/materials/HologramShaderMaterial';

export class HologramManager {
    private readonly group = new Group();
    private isXRMode = false;
    private readonly geometryFactory: GeometryFactory;
    private readonly ringInstances: InstancedMesh[] = [];
    private readonly sphereInstances: InstancedMesh[] = [];
    private readonly tempMatrix = new Matrix4();
    private readonly instanceCount = 3;
    private readonly materialFactory: MaterialFactory;

    constructor(
        private readonly scene: Scene,
        _renderer: WebGLRenderer,  // Used by subclasses
        private settings: Settings
    ) {
        this.geometryFactory = GeometryFactory.getInstance();
        this.materialFactory = MaterialFactory.getInstance();
        
        // Enable bloom layer
        this.group.layers.enable(1);
        this.createHolograms();
        this.scene.add(this.group);
    }

    private createHolograms() {
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            this.group.remove(child);
            if (child instanceof Mesh || child instanceof InstancedMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        }

        const quality = this.isXRMode ? 'high' : this.settings.xr.quality;
        const baseMaterial = this.materialFactory.getHologramMaterial(this.settings);

        // Create instanced rings
        const sphereSizes = this.settings.visualization.hologram.sphereSizes;
        
        // Create one ring instance for each size
        sphereSizes.forEach(size => {
            const ring = new InstancedMesh(
                this.geometryFactory.getHologramGeometry('ring', quality, size),
                baseMaterial.clone(),
                this.instanceCount
            );
            
            // Set up ring instances with different rotations
            for (let j = 0; j < this.instanceCount; j++) {
                this.tempMatrix.makeRotationX(Math.PI / 3 * j);
                this.tempMatrix.multiply(new Matrix4().makeRotationY(Math.PI / 6 * j));
                ring.setMatrixAt(j, this.tempMatrix);
            }
            
            ring.instanceMatrix.needsUpdate = true;
            ring.layers.enable(1); // Enable bloom layer
            this.ringInstances.push(ring);
            this.group.add(ring);
        });

        if (this.settings.visualization.hologram.enableTriangleSphere) {
            const size = this.settings.visualization.hologram.triangleSphereSize;
            const sphereMesh = new InstancedMesh(
                this.geometryFactory.getHologramGeometry('triangleSphere', quality, size),
                baseMaterial.clone(),
                this.instanceCount
            );
            
            // Set up sphere instances with different scales and rotations
            for (let i = 0; i < this.instanceCount; i++) {
                this.tempMatrix.makeScale(0.8 + (i * 0.2), 0.8 + (i * 0.2), 0.8 + (i * 0.2));
                this.tempMatrix.multiply(new Matrix4().makeRotationX(Math.PI / 4 * i));
                this.tempMatrix.multiply(new Matrix4().makeRotationY(Math.PI / 3 * i));
                sphereMesh.setMatrixAt(i, this.tempMatrix);
            }
            
            sphereMesh.instanceMatrix.needsUpdate = true;
            
            // Set material properties
            const material = (sphereMesh.material as HologramShaderMaterial);
            material.uniforms.opacity.value = this.settings.visualization.hologram.triangleSphereOpacity;
            material.setEdgeOnly(true);
            
            sphereMesh.layers.enable(1); // Enable bloom layer
            this.sphereInstances.push(sphereMesh);
            this.group.add(sphereMesh);
        }
    }

    setXRMode(enabled: boolean) {
        this.isXRMode = enabled;
        this.group.traverse(child => {
            if (child instanceof Mesh && child.material instanceof HologramShaderMaterial) {
                child.material.defines = { USE_AR: '' };
                child.material.needsUpdate = true;
            }
        });
        this.createHolograms();
    }

    handleInteraction(position: Vector3) {
        this.group.traverse(child => {
            if (child instanceof Mesh && child.material instanceof HologramShaderMaterial) {
                const distance = position.distanceTo(child.position);
                if (distance < 0.5 && child.material.uniforms) {
                    child.material.uniforms.pulseIntensity.value = 0.4;
                    setTimeout(() => {
                        if (child.material instanceof HologramShaderMaterial && child.material.uniforms) {
                            child.material.uniforms.pulseIntensity.value = 0.2;
                        }
                    }, 500);
                }
            }
        });
    }

    update(deltaTime: number) {
        this.group.traverse(child => {
            if (child instanceof InstancedMesh) {
                const rotationSpeed = this.settings.visualization.hologram.globalRotationSpeed;
                
                // Update each instance's rotation
                for (let i = 0; i < child.count; i++) {
                    child.getMatrixAt(i, this.tempMatrix);
                    
                    // Apply rotation based on instance index
                    const instanceSpeed = rotationSpeed * (i + 1);
                    this.tempMatrix.multiply(new Matrix4().makeRotationY(instanceSpeed * deltaTime));
                    
                    child.setMatrixAt(i, this.tempMatrix);
                }
                
                child.instanceMatrix.needsUpdate = true;
                
                // Update shader time
                const material = child.material as HologramShaderMaterial;
                material.uniforms.time.value += deltaTime;
            }
        });
    }

    updateSettings(newSettings: Settings) {
        this.settings = newSettings;
        this.materialFactory.updateMaterial('hologram', this.settings);
        this.createHolograms();
    }

    getGroup() {
        return this.group;
    }

    dispose() {
        // Geometries and materials are managed by the factories
        this.scene.remove(this.group);
    }
}
