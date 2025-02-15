import {
    Object3D,
    Camera,
    Vector3,
    Sprite,
    SpriteMaterial,
    Texture
} from 'three';
import { NodeMetadata } from '../../../types/metadata';
import { createLogger } from '../../../core/logger';

const logger = createLogger('NodeMetadataManager');

interface MetadataLabel {
    sprite: Sprite;
    metadata: NodeMetadata;
    lastUpdateDistance: number;
}

export class NodeMetadataManager {
    private static instance: NodeMetadataManager;
    private labels: Map<string, MetadataLabel> = new Map();
    private readonly VISIBILITY_THRESHOLD = 50;  // Maximum distance for label visibility
    private readonly UPDATE_INTERVAL = 5;        // Frames between visibility updates
    private readonly LABEL_SCALE = 0.5;         // Base scale for labels
    private frameCount = 0;

    // Reusable objects
    private tempVector = new Vector3();
    private labelCanvas: HTMLCanvasElement;
    private labelContext: CanvasRenderingContext2D;

    private constructor() {
        // Create canvas for label textures
        this.labelCanvas = document.createElement('canvas');
        this.labelCanvas.width = 256;
        this.labelCanvas.height = 128;
        
        const context = this.labelCanvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get 2D context for label canvas');
        }
        this.labelContext = context;
        
        // Set up default text style
        this.labelContext.textAlign = 'center';
        this.labelContext.textBaseline = 'middle';
        this.labelContext.font = 'bold 24px Arial';
    }

    public static getInstance(): NodeMetadataManager {
        if (!NodeMetadataManager.instance) {
            NodeMetadataManager.instance = new NodeMetadataManager();
        }
        return NodeMetadataManager.instance;
    }

    private createLabelTexture(metadata: NodeMetadata): Texture {
        // Clear canvas
        this.labelContext.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        // Draw background
        this.labelContext.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.labelContext.fillRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        // Draw text
        this.labelContext.fillStyle = 'white';
        this.labelContext.fillText(
            metadata.name || 'Unknown',
            this.labelCanvas.width / 2,
            this.labelCanvas.height / 2
        );

        // Create texture
        const texture = new Texture(this.labelCanvas);
        texture.needsUpdate = true;
        return texture;
    }

    public async createMetadataLabel(metadata: NodeMetadata): Promise<Object3D> {
        const texture = this.createLabelTexture(metadata);
        const material = new SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });

        const sprite = new Sprite(material);
        sprite.scale.set(this.LABEL_SCALE, this.LABEL_SCALE * 0.5, 1);
        sprite.position.y = 1.5; // Position above node

        const label: MetadataLabel = {
            sprite,
            metadata,
            lastUpdateDistance: Infinity
        };

        this.labels.set(metadata.id, label);
        return sprite;
    }

    public update(camera: Camera): void {
        this.frameCount++;
        if (this.frameCount % this.UPDATE_INTERVAL !== 0) return;

        const cameraPosition = camera.position;

        this.labels.forEach((label) => {
            const { sprite, metadata } = label;
            
            // Calculate distance to camera
            this.tempVector.set(
                metadata.position.x,
                metadata.position.y,
                metadata.position.z
            );
            const distance = this.tempVector.distanceTo(cameraPosition);

            // Update visibility based on distance
            const visible = distance < this.VISIBILITY_THRESHOLD;
            sprite.visible = visible;

            if (visible) {
                // Scale based on distance
                const scale = Math.max(0.3, 1 - (distance / this.VISIBILITY_THRESHOLD));
                sprite.scale.set(
                    this.LABEL_SCALE * scale,
                    this.LABEL_SCALE * scale * 0.5,
                    1
                );

                // Make sprite face camera
                sprite.lookAt(cameraPosition);
            }

            // Update last known distance
            label.lastUpdateDistance = distance;
        });
    }

    public updateMetadata(id: string, metadata: NodeMetadata): void {
        const label = this.labels.get(id);
        if (!label) return;

        // Update metadata
        label.metadata = metadata;

        // Update texture
        const texture = this.createLabelTexture(metadata);
        (label.sprite.material as SpriteMaterial).map?.dispose();
        (label.sprite.material as SpriteMaterial).map = texture;
    }

    public removeLabel(id: string): void {
        const label = this.labels.get(id);
        if (!label) return;

        // Clean up resources
        (label.sprite.material as SpriteMaterial).map?.dispose();
        label.sprite.material.dispose();
        
        // Remove from tracking
        this.labels.delete(id);
    }

    public dispose(): void {
        // Clean up all labels
        this.labels.forEach((label) => {
            (label.sprite.material as SpriteMaterial).map?.dispose();
            label.sprite.material.dispose();
        });
        this.labels.clear();

        // Reset singleton
        NodeMetadataManager.instance = null!;
        logger.info('Disposed NodeMetadataManager');
    }
}