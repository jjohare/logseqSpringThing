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
import { debugState } from '../core/debugState';
import { logger, createDataMetadata, createErrorMetadata } from '../core/logger';

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
    boundingBox: THREE.Box3 | null;
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
    private metadataLabelMap: Map<string, MetadataLabelGroup> = new Map();

    // Default values for missing data
    private readonly DEFAULT_FILE_SIZE = 1000; // 1KB

    constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene, settings: Settings) {
        logger.info('MetadataVisualizer constructor called', createDataMetadata({
            timestamp: Date.now(),
            cameraPosition: camera?.position ? {x: camera.position.x, y: camera.position.y, z: camera.position.z} : 'undefined'
        }));
        
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
        logger.info('MetadataVisualizer labelGroup added to scene');
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
            logger.info('Font loaded successfully on first attempt');
        } catch (error) {
            logger.error('Initial font load failed:', createErrorMetadata(error));
            await this.retryFontLoad();
        }
    }

    private async attemptFontLoad(): Promise<void> {
        logger.info(`Attempting to load font from ${this.fontPath}`);
        this.font = await new Promise((resolve, reject) => {
            this.fontLoader.load(
                // Font path
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
                if (debugState.isShaderDebugEnabled()) {
                    logger.info('Font loaded successfully after retry');
                }
                break;
            } catch (error) {
                logger.error(`Font load attempt ${this.fontLoadAttempts} failed:`, createErrorMetadata(error));
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
            size: this.settings.visualization.labels.desktopFontSize / 10 || 0.5,
            depth: 0.01 // Fixed thin depth for better readability
        });

        const material = new THREE.MeshStandardMaterial({
            color: this.settings.visualization.labels.textColor || '#ffffff',
            metalness: 0.1,
            roughness: 0.6,
            emissive: this.settings.visualization.labels.textColor || '#ffffff',
            transparent: true,
            opacity: 1.0,
            side: THREE.DoubleSide,
            depthWrite: false, // Disable depth writing to prevent occlusion
            depthTest: false   // Disable depth testing to ensure visibility
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
            logger.warn(`Cannot create text mesh: font not loaded yet (text: ${text})`);
            return null;
        }
        
        logger.debug(`Creating text mesh: "${text}"`);

        const textGeometry = new TextGeometry(text, {
            font: this.font,
            size: this.settings.visualization.labels.desktopFontSize / 10 || 0.5,
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
            depthWrite: false,  // Changed to false to prevent occlusion by other objects
            depthTest: false    // Changed to false for consistent behavior
        });

        // Add outline for better visibility
        if (this.settings.visualization.labels.textOutlineWidth > 0) {
            const outlineMaterial = new MeshBasicMaterial({
                color: this.settings.visualization.labels.textOutlineColor || '#000000',
                side: DoubleSide,
                depthWrite: false, // Disable depth writing for outline to match main material
                depthTest: false   // Disable depth testing to ensure outline is always visible
            });
            
            const outlineWidth = this.settings.visualization.labels.textOutlineWidth;
            // Create a new geometry for the outline to avoid sharing
            const outlineGeometry = new TextGeometry(text, {
                font: this.font,
                size: this.settings.visualization.labels.desktopFontSize / 10 || 0.5,
                depth: 0.1,
                curveSegments: this.settings.visualization.labels.textResolution || 4,
                bevelEnabled: false
            }) as ExtendedTextGeometry;
            outlineGeometry.computeBoundingBox();
            
            const outlineMesh = new Mesh(outlineGeometry as unknown as BufferGeometry, outlineMaterial);
            outlineMesh.scale.multiplyScalar(1 + outlineWidth);
            
            const group = new Group();
            group.add(outlineMesh);
            outlineMesh.renderOrder = 1000; // Ensure outline renders on top
            group.add(new Mesh(textGeometry as unknown as BufferGeometry, material));
            group.renderOrder = 1000; // Ensure entire group renders on top
            
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
        mesh.renderOrder = 1000; // Ensure text mesh renders on top

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

    /**
     * Format file size in a human-readable way
     * @param bytes File size in bytes
     * @returns Formatted string (e.g., "1.5 KB")
     */
    private formatFileSize(bytes: number): string {
        if (!bytes || isNaN(bytes)) return 'N/A';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    /**
     * Create a metadata label for a node
     * CRITICAL: This function now explicitly accepts a nodeLabel parameter
     * to prioritize the label from the Node object over metadata.name
     * @param metadata Metadata object containing node details
     * @param nodeLabel Optional label from Node.label property (preferred over metadata.name)
     */
    public async createMetadataLabel(metadata: NodeMetadata, nodeLabel?: string): Promise<MetadataLabelGroup> {
        const group = new Group() as MetadataLabelGroup;

        // Validate position data
        if (!metadata.position) {
            // Create a default position if missing
            metadata.position = new Vector3(0, 0, 0);
            logger.warn(`Missing position for node ${metadata.id}, using default position`);
        } else if (metadata.position.x === 0 && metadata.position.y === 0 && metadata.position.z === 0) {
            // Log warning for zero position but continue
            logger.warn(`Zero position detected for node ${metadata.id}`);
        }
        
        group.name = 'metadata-label';
        group.renderOrder = 1000; // Set high render order to ensure visibility
        group.userData = { isMetadata: true };
        
        // Log the label source for debugging
        logger.info(`Creating metadata label for node ${metadata.id}`, createDataMetadata({
            labelSource: nodeLabel ? 'explicit nodeLabel' : 'metadata.name',
            displayName: nodeLabel || metadata.name,
            position: metadata.position ? 
                `x:${metadata.position.x.toFixed(2)}, y:${metadata.position.y.toFixed(2)}, z:${metadata.position.z.toFixed(2)}` : 
                'undefined',
            fileSize: metadata.fileSize || 'undefined',
            hyperlinkCount: metadata.hyperlinkCount || 'undefined'
        }));
        
        // Create text for name
        // First priority should be the explicitly passed nodeLabel (from Node object)
        // Second priority is metadata.name if available
        // Fallback to metadata.id if nothing else is available
        const displayName = nodeLabel || metadata.name || metadata.id || "Unknown";
        const nameMesh = await this.createTextMesh(displayName);
        if (nameMesh) {
            nameMesh.position.y = 1.2;
            // Log position and scale to verify
            logger.debug(`nameMesh created at position y=${nameMesh.position.y} with scale=${nameMesh.scale.x}`);
            nameMesh.scale.setScalar(0.8);
            group.add(nameMesh);
        }
        
        // Create text for file size
        // Access fileSize directly from the metadata object
        const fileSize = metadata.fileSize !== undefined ? metadata.fileSize : this.DEFAULT_FILE_SIZE;
        const fileSizeText = `Size: ${this.formatFileSize(fileSize)}`;
        const fileSizeMesh = await this.createTextMesh(fileSizeText);
        if (fileSizeMesh) {
            fileSizeMesh.position.y = 0.8;
            fileSizeMesh.scale.setScalar(0.7);
            logger.debug(`fileSizeMesh created at position y=${fileSizeMesh.position.y} with scale=${fileSizeMesh.scale.x}`);
            group.add(fileSizeMesh);

            if (debugState.isNodeDebugEnabled()) {
                logger.debug(`Created file size label: ${fileSizeText} for node "${displayName}" (${metadata.id})`);
            }
            
            if (debugState.isNodeDebugEnabled()) {
                logger.debug(`Creating file size label: ${fileSizeText} for node ${metadata.id}`);
            }
        }

        // Create text for hyperlink count
        // Ensure we have a valid value, defaulting to 0 if undefined or invalid
        const hyperlinkCount = Number.isFinite(metadata.hyperlinkCount) ? metadata.hyperlinkCount : 0;
        const linksText = `Links: ${hyperlinkCount}`;
        if (hyperlinkCount > 0 && debugState.isNodeDebugEnabled()) {
            logger.debug(`Creating hyperlink count label: ${linksText} for node ${metadata.id}`);
        }
        const linksMesh = await this.createTextMesh(linksText);
        if (linksMesh) {
            linksMesh.position.y = 0.4;
            linksMesh.scale.setScalar(0.7);
            logger.debug(`linksMesh created at position y=${linksMesh.position.y} with scale=${linksMesh.scale.x}`);
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

        // Add to label map for tracking
        this.metadataLabelMap.set(metadata.id, group);
        
        // Verify layer settings on the group
        logger.debug(`Label group for ${metadata.id} - Layer visibility:`, createDataMetadata({
            layerInfo: `Mask value: ${group.layers.mask.toString(2)}`,
            isOnLayer0: Boolean(group.layers.mask & (1 << 0)),
            isOnLayer1: Boolean(group.layers.mask & (1 << 1))
        }));
        
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

    /**
     * Update the position of a metadata label
     * @param id The node ID
     * @param position The new position
     */
    public updateMetadataPosition(id: string, position: Vector3): void {
        const group = this.metadataLabelMap.get(id);
        if (!group) {
            // Only log in debug mode to avoid console spam
            if (debugState.isNodeDebugEnabled()) {
                logger.debug(`No metadata label found for node ${id} to update position`);
            }
            return;
        }
        
        // Update the position
        group.position.copy(position);
        
        // Occasionally log position updates for important nodes (using modulo to reduce spam)
        if (Math.random() < 0.01) { // Only log ~1% of updates
            logger.debug(`Updated position for node ${id} to`, createDataMetadata({
                x: position.x.toFixed(2),
                y: position.y.toFixed(2),
                z: position.z.toFixed(2)
            }));
        }
    }
    
    /**
     * Clear all metadata labels
     */
    public clearAllLabels(): void {
        logger.info(`Clearing all metadata labels (count: ${this.metadataLabelMap.size})`);
        
        // Remove all labels from the scene
        this.metadataLabelMap.forEach((group) => {
            this.labelGroup.remove(group);
        });
        
        // Clear the map
        this.metadataLabelMap.clear();
    }

    public setXRMode(enabled: boolean): void {
        logger.info(`Setting XR mode: ${enabled ? 'enabled' : 'disabled'}`);
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
        logger.info('Disposing MetadataVisualizer resources');
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
        
        // Clear label map
        this.metadataLabelMap.clear();
    }
}
