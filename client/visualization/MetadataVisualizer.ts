import * as THREE from 'three';
import {
    Mesh,
    Group,
    MeshStandardMaterial,
    MeshBasicMaterial,
    Vector3,
    DoubleSide,
    BufferGeometry,
    Object3D
} from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { NodeMetadata } from '../types/metadata';
import { Settings } from '../types/settings';
import { platformManager } from '../platform/platformManager';

type GeometryWithBoundingBox = THREE.BufferGeometry & {
    boundingBox: THREE.Box3 | null;
    computeBoundingBox: () => void;
};

interface MetadataLabelGroup extends Group {
    name: string;
    userData: {
        isMetadata: boolean;
    };
}

export type MetadataLabelCallback = (group: MetadataLabelGroup) => void;

interface ExtendedTextGeometry extends TextGeometry {
    computeBoundingBox: () => void;
    boundingBox: {
        max: { x: number };
        min: { x: number };
    } | null;
}

export class MetadataVisualizer {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private fontLoader: FontLoader;
    private font: Font | null;
    private fontPath: string;
    private labelGroup: THREE.Group;
    private settings: Settings;
    private fontLoadAttempts: number = 0;

    constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene, settings: Settings) {
        this.scene = scene;
        this.camera = camera;
        this.fontLoader = new FontLoader();
        this.font = null;
        this.fontPath = '/fonts/helvetiker_regular.typeface.json';
        this.labelGroup = new THREE.Group();
        
        // Enable both layers by default for desktop mode
        this.labelGroup.layers.enable(0);
        this.labelGroup.layers.enable(1);
        
        this.settings = settings;
        this.scene.add(this.labelGroup);
        this.loadFont();
        
        // Set initial layer mode
        this.setXRMode(platformManager.isXRMode);
        
        // Listen for XR mode changes
        platformManager.on('xrmodechange', (enabled: boolean) => {
            this.setXRMode(enabled);
        });
    }

    private readonly geometries = {
        SPHERE: new THREE.SphereGeometry(1, 32, 32),
        ICOSAHEDRON: new THREE.IcosahedronGeometry(1),
        OCTAHEDRON: new THREE.OctahedronGeometry(1)
    };

    private async loadFont(): Promise<void> {
        try {
            await this.attemptFontLoad();
        } catch (error) {
            console.error('Initial font load failed:', error);
            await this.retryFontLoad();
        }
    }

    private async attemptFontLoad(): Promise<void> {
        this.font = await new Promise((resolve, reject) => {
            this.fontLoader.load(
                this.fontPath,
                resolve,
                undefined,
                reject
            );
        });
    }

    private async retryFontLoad(maxAttempts: number = 3): Promise<void> {
        while (this.fontLoadAttempts < maxAttempts && !this.font) {
            this.fontLoadAttempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                await this.attemptFontLoad();
                console.log('Font loaded successfully after retry');
                break;
            } catch (error) {
                console.error(`Font load attempt ${this.fontLoadAttempts} failed:`, error);
            }
        }
    }

    public createLabel(text: string, position: THREE.Vector3): void {
        if (!this.font) {
            console.warn('Font not loaded yet');
            return;
        }

        const textGeometry = new TextGeometry(text, {
            font: this.font,
            size: 0.2, // Fixed world-space size for consistent scale
            height: 0.01 // Fixed thin height for better readability
        });

        const material = new THREE.MeshStandardMaterial({
            color: this.settings.visualization.labels.textColor || '#ffffff',
            metalness: 0.1,
            roughness: 0.6,
            emissive: this.settings.visualization.labels.textColor || '#ffffff',
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide
        });

        // Create mesh with the text geometry and center it
        const geometry = textGeometry as unknown as GeometryWithBoundingBox;
        geometry.computeBoundingBox();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);

        if (geometry.boundingBox) {
            const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
            mesh.position.x -= width / 2;
        }
        
        this.labelGroup.add(mesh);
    }

    public async createTextMesh(text: string): Promise<Mesh | Group | null> {
        if (!this.font) {
            console.warn('Font not loaded yet');
            return null;
        }

        const textGeometry = new TextGeometry(text, {
            font: this.font,
            size: 0.2, // Fixed world-space size for consistent scale
            depth: 0.1, // Using depth instead of height
            curveSegments: this.settings.visualization.labels.textResolution || 4,
            bevelEnabled: false
        }) as ExtendedTextGeometry;

        // Compute bounding box right after creation
        textGeometry.computeBoundingBox();

        const material = new MeshStandardMaterial({
            color: this.settings.visualization.labels.textColor || '#ffffff',
            metalness: 0.1,
            roughness: 0.6,
            emissive: this.settings.visualization.labels.textColor || '#ffffff',
            transparent: true,
            opacity: 1.0,
            side: DoubleSide,
            depthWrite: true,
            depthTest: true
        });

        // Add outline for better visibility
        if (this.settings.visualization.labels.textOutlineWidth > 0) {
            const outlineMaterial = new MeshBasicMaterial({
                color: this.settings.visualization.labels.textOutlineColor || '#000000',
                side: DoubleSide
            });
            
            const outlineWidth = this.settings.visualization.labels.textOutlineWidth;
            // Create a new geometry for the outline to avoid sharing
            const outlineGeometry = new TextGeometry(text, {
                font: this.font,
                size: 0.2, // Fixed world-space size for consistent scale
                depth: 0.1,
                curveSegments: this.settings.visualization.labels.textResolution || 4,
                bevelEnabled: false
            }) as ExtendedTextGeometry;
            outlineGeometry.computeBoundingBox();
            
            const outlineMesh = new Mesh(outlineGeometry as unknown as BufferGeometry, outlineMaterial);
            outlineMesh.scale.multiplyScalar(1 + outlineWidth);
            
            const group = new Group();
            group.add(outlineMesh);
            group.add(new Mesh(textGeometry as unknown as BufferGeometry, material));
            
            // Center the group
            const bbox = textGeometry.boundingBox;
            if (bbox) {
                const width = bbox.max.x - bbox.min.x;
                group.position.x -= width / 2;
            }
            
            return group;
        }

        // Create mesh with the text geometry and center it
        const bbox = textGeometry.boundingBox;
        const mesh = new Mesh(textGeometry as unknown as BufferGeometry, material);

        if (bbox) {
            const width = bbox.max.x - bbox.min.x;
            mesh.position.x -= width / 2;
        }

        return mesh;
    }

    public createNodeVisual = (metadata: NodeMetadata): THREE.Mesh => {
        const geometry = this.getGeometryFromAge(metadata.commitAge);
        const material = this.createMaterialFromHyperlinks(metadata.hyperlinkCount);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(
            metadata.position.x,
            metadata.position.y,
            metadata.position.z
        );

        return mesh;
    }

    private getGeometryFromAge = (age: number): THREE.BufferGeometry => {
        if (age < 7) return this.geometries.SPHERE;
        if (age < 30) return this.geometries.ICOSAHEDRON;
        return this.geometries.OCTAHEDRON;
    }

    private createMaterialFromHyperlinks(count: number): THREE.Material {
        const hue = Math.min(count / 10, 1) * 0.3; // 0 to 0.3 range
        const color = new THREE.Color().setHSL(hue, 0.7, 0.5);

        return new THREE.MeshPhongMaterial({
            color: color,
            shininess: 30,
            transparent: true,
            opacity: 0.9
        });
    }

    public async createMetadataLabel(metadata: NodeMetadata): Promise<MetadataLabelGroup> {
        const group = new Group() as MetadataLabelGroup;
        group.name = 'metadata-label';
        group.userData = { isMetadata: true };

        // Create text for name
        const nameMesh = await this.createTextMesh(metadata.name);
        if (nameMesh) {
            nameMesh.position.y = 1.2;
            nameMesh.scale.setScalar(1.0); // Base size for name
            group.add(nameMesh);
        }

        // Create text for commit age
        const ageMesh = await this.createTextMesh(`${Math.round(metadata.commitAge)} days`);
        if (ageMesh) {
            ageMesh.position.y = 0.8;
            ageMesh.scale.setScalar(0.8); // Slightly smaller than name
            group.add(ageMesh);
        }

        // Create text for hyperlink count
        const linksMesh = await this.createTextMesh(`${metadata.hyperlinkCount} links`);
        if (linksMesh) {
            linksMesh.position.y = 0.4;
            linksMesh.scale.setScalar(0.8); // Slightly smaller than name
            group.add(linksMesh);
        }

        // Set up billboarding
        const tempVec = new Vector3();
        const billboardMode = this.settings.visualization.labels.billboardMode;

        const updateBillboard = () => {
            if (billboardMode === 'camera') {
                // Full billboard - always face camera
                group.quaternion.copy(this.camera.quaternion);
            } else {
                // Vertical billboard - only rotate around Y axis
                tempVec.copy(this.camera.position).sub(group.position);
                tempVec.y = 0;
                group.lookAt(tempVec.add(group.position));
            }
        };

        // Add to render loop
        const onBeforeRender = () => {
            updateBillboard();
        };
        group.onBeforeRender = onBeforeRender;

        // Set initial layer
        this.setGroupLayer(group, platformManager.isXRMode);

        return group;
    }

    private setGroupLayer(group: Object3D, enabled: boolean): void {
        if (enabled) {
            // In XR mode, only show on layer 1
            group.traverse(child => {
                child.layers.disable(0);
                child.layers.enable(1);
            });
            group.layers.disable(0);
            group.layers.enable(1);
        } else {
            // In desktop mode, show on both layers
            group.traverse(child => {
                child.layers.enable(0);
                child.layers.enable(1);
            });
            group.layers.enable(0);
            group.layers.enable(1);
        }
    }

    public setXRMode(enabled: boolean): void {
        if (enabled) {
            // In XR mode, only show on layer 1
            this.labelGroup.traverse(child => {
                child.layers.disable(0);
                child.layers.enable(1);
            });
            this.labelGroup.layers.disable(0);
            this.labelGroup.layers.enable(1);
        } else {
            // In desktop mode, show on both layers
            this.labelGroup.traverse(child => {
                child.layers.enable(0);
                child.layers.enable(1);
            });
            this.labelGroup.layers.enable(0);
            this.labelGroup.layers.enable(1);
        }
    }

    public dispose(): void {
        // Clean up geometries
        Object.values(this.geometries).forEach(geometry => geometry.dispose());
        
        // Clean up label group
        this.labelGroup.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (child.material instanceof THREE.Material) {
                    child.material.dispose();
                }
            }
        });
    }
}
