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
import { SettingsStore } from '../state/SettingsStore';

export class HologramManager {
    private readonly group = new Group();
    private isXRMode = false;
    private readonly geometryFactory: GeometryFactory;
    private readonly ringInstances: InstancedMesh[] = [];
    private readonly sphereInstances: InstancedMesh[] = [];
    private readonly tempMatrix = new Matrix4();
    private readonly instanceCount = 3;
    private readonly materialFactory: MaterialFactory;
    private readonly settingsStore: SettingsStore;

    constructor(
        private readonly scene: Scene,
        _renderer: WebGLRenderer,  // Used by subclasses
        private settings: Settings
    ) {
        this.geometryFactory = GeometryFactory.getInstance();
        this.materialFactory = MaterialFactory.getInstance();
        this.settingsStore = SettingsStore.getInstance();
        
        // Enable bloom layer
        this.group.layers.set(0);  // First set default layer
        this.group.layers.enable(1);  // Then enable bloom layer
        this.createHolograms();
        this.scene.add(this.group);

        // Subscribe to settings changes
        this.settingsStore.subscribe('visualization.hologram', (_path: string, settings: any) => {
            if (settings && typeof settings === 'object') {
                this.settings = {
                    ...this.settings,
                    visualization: {
                        ...this.settings.visualization,
                        hologram: settings
                    }
                };
                this.updateSettings(this.settings);
            }
        });
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
            // Get unit-sized geometry and scale it
            const ring = new InstancedMesh(
                this.geometryFactory.getHologramGeometry('ring', quality),
                baseMaterial.clone(),
                this.instanceCount
            );
            
            // Set up ring instances with different rotations and scales
            for (let j = 0; j < this.instanceCount; j++) {
                this.tempMatrix.makeRotationX(Math.PI / 3 * j);
                this.tempMatrix.multiply(new Matrix4().makeRotationY(Math.PI / 6 * j));
                // Apply size in meters from settings
                this.tempMatrix.multiply(new Matrix4().makeScale(size, size, size));
                ring.setMatrixAt(j, this.tempMatrix);
            }
            
            ring.instanceMatrix.needsUpdate = true;
            // Make sure each ring has bloom layer enabled properly
            ring.layers.set(0);  // Set default layer first
            ring.layers.enable(1);  // Then enable bloom layer
            this.ringInstances.push(ring);
            this.group.add(ring);
        });

        if (this.settings.visualization.hologram.enableTriangleSphere) {
            const baseSize = this.settings.visualization.hologram.triangleSphereSize;
            const sphereMesh = new InstancedMesh(
                this.geometryFactory.getHologramGeometry('triangleSphere', quality),
                baseMaterial.clone(),
                this.instanceCount
            );
            
            // Set up sphere instances with different scales and rotations
            for (let i = 0; i < this.instanceCount; i++) {
                // Scale each instance relative to the base size (80%, 100%, 120%)
                const scale = baseSize * (0.8 + (i * 0.2));
                this.tempMatrix.makeScale(scale, scale, scale);
                this.tempMatrix.multiply(new Matrix4().makeRotationX(Math.PI / 4 * i));
                this.tempMatrix.multiply(new Matrix4().makeRotationY(Math.PI / 3 * i));
                sphereMesh.setMatrixAt(i, this.tempMatrix);
            }
            
            sphereMesh.instanceMatrix.needsUpdate = true;
            
            // Set material properties
            const material = (sphereMesh.material as HologramShaderMaterial);
            material.uniforms.opacity.value = this.settings.visualization.hologram.triangleSphereOpacity;
            material.setEdgeOnly(true);
            
            // Make sure sphere has bloom layer enabled properly
            sphereMesh.layers.set(0);  // Set default layer first
            sphereMesh.layers.enable(1);  // Then enable bloom layer
            this.sphereInstances.push(sphereMesh);
            this.group.add(sphereMesh);
        }
    }

    setXRMode(enabled: boolean) {
        this.isXRMode = enabled;
        this.group.traverse(child => {
            if (child instanceof Mesh && child.material instanceof HologramShaderMaterial) {
                child.material = new HologramShaderMaterial(this.settings, enabled ? 'ar' : 'desktop');
            }
        });
        this.createHolograms();
    }

    handleInteraction(position: Vector3) {
        const interactionRadius = this.settings.xr.interactionRadius;
        this.group.traverse(child => {
            if (child instanceof Mesh && child.material instanceof HologramShaderMaterial) {
                const distance = position.distanceTo(child.position);
                if (distance < interactionRadius && child.material.uniforms) {
                    child.material.handleInteraction(position);
                }
            }
        });
    }

    update(deltaTime: number) {
        // Get base rotation speed from settings
        const rotationSpeed = this.settings.visualization.hologram.globalRotationSpeed;
        
        // Process all ring instances
        for (const instance of this.ringInstances) {
            this.updateInstancedMeshRotations(instance, rotationSpeed, deltaTime);
        }
        
        // Process all sphere instances
        for (const instance of this.sphereInstances) {
            this.updateInstancedMeshRotations(instance, rotationSpeed, deltaTime);
        }
    }
    
    private updateInstancedMeshRotations(mesh: InstancedMesh, rotationSpeed: number, deltaTime: number) {
        // Update each instance's rotation
        for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, this.tempMatrix);
            
            // Apply rotation based on instance index (faster for higher indices)
            const instanceSpeed = rotationSpeed * (i + 1);
            this.tempMatrix.multiply(new Matrix4().makeRotationY(instanceSpeed * deltaTime));
            mesh.setMatrixAt(i, this.tempMatrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        
        // Update shader time in material
        if (mesh.material instanceof HologramShaderMaterial) {
            mesh.material.update(deltaTime);
        }
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
