import {
    Scene,
    Camera,
    Group,
    Texture,
    BufferGeometry,
    NearestFilter,
    ClampToEdgeWrapping,
    InstancedBufferAttribute,
    PlaneGeometry,
    Mesh,
    Vector3,
    Color,
    MeshBasicMaterial,
    BufferAttribute
} from 'three';
import { debugState } from '../core/debugState';
import { createLogger } from '../core/logger';
import { LabelSettings } from '../types/settings';
import { platformManager } from '../platform/platformManager';
import { SDFFontAtlasGenerator } from './SDFFontAtlasGenerator';
import '../types/three-ext.d';

const logger = createLogger('UnifiedTextRenderer');

// Note: Using fallback basic material approach instead of custom shaders
// to avoid WebGL shader compilation issues

interface LabelInstance {
    id: string;
    text: string;
    position: Vector3;
    scale: number;
    color: Color;
    visible: boolean;
    lastUpdated: number; // Timestamp for debugging update sequence
}

export class UnifiedTextRenderer {
    private scene: Scene;
    private camera: Camera;
    private group: Group;
    private material: MeshBasicMaterial;
    private geometry: BufferGeometry;
    private mesh: Mesh;
    private fontAtlas: Texture | null;
    private labels: Map<string, LabelInstance>;
    private settings: LabelSettings;
    private maxInstances: number;
    private currentInstanceCount: number;
    private logger = createLogger('UnifiedTextRenderer');
    private fontAtlasGenerator: SDFFontAtlasGenerator;
    // Reduced LABEL_SCALE by 10x
    private readonly LABEL_SCALE = 0.05; // Was 0.5 previously
    
    constructor(camera: Camera, scene: Scene, settings: LabelSettings) {
        this.scene = scene;
        this.camera = camera;
        this.settings = settings;
        
        // Only log detailed settings when data debugging is enabled
        if (debugState.isDataDebugEnabled()) {
            logger.info('UnifiedTextRenderer settings:', {
                enableLabels: this.settings.enableLabels,
                desktopFontSize: this.settings.desktopFontSize,
                textColor: this.settings.textColor,
                billboardMode: this.settings.billboardMode
            });
        }

        this.labels = new Map();
        this.maxInstances = 2000;
        this.currentInstanceCount = 0;
        this.fontAtlas = null;
        
        this.group = new Group();
        this.scene.add(this.group);
        
        this.fontAtlasGenerator = new SDFFontAtlasGenerator(2048, 8, 16);

        // Only log initialization details when debugging is enabled
        if (debugState.isDataDebugEnabled()) {
            this.logger.info('Initializing material with basic settings', {
                color: this.settings.textColor,
                transparent: true
            });
        }
        
        // Use basic material instead of shader material to avoid WebGL issues.
        // Disable depthTest and depthWrite so labels are always visible.
        this.material = new MeshBasicMaterial({ 
            color: new Color(this.settings.textColor),
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        
        this.geometry = this.createInstancedGeometry();
        
        // Only log geometry details when debugging is enabled
        if (debugState.isDataDebugEnabled()) {
            this.logger.info('Created instanced geometry:', {
                maxInstances: this.maxInstances,
                instancePosition: this.geometry.getAttribute('instancePosition')?.count,
                instanceColor: this.geometry.getAttribute('instanceColor')?.count,
                instanceScale: this.geometry.getAttribute('instanceScale')?.count
            });
        }
        
        this.mesh = new Mesh(this.geometry, this.material);
        // Ensure text labels render on top by assigning a very high render order
        this.mesh.renderOrder = 1000; // Increased to match NodeMetadataManager sprite renderOrder
        this.group.add(this.mesh);
        
        this.setXRMode(platformManager.isXRMode);
        platformManager.on('xrmodechange', (enabled: boolean) => {
            this.setXRMode(enabled);
        });
        
        // Initialize font atlas
        this.initializeFontAtlas();
    }
    
    private async initializeFontAtlas(): Promise<void> {
        try {
            // Only log font atlas generation details when debugging is enabled
            if (debugState.isDataDebugEnabled()) {
                this.logger.info('Starting font atlas generation with params:', {
                    fontFamily: 'Arial',
                    fontSize: 32,
                    textureSize: (this.fontAtlasGenerator as any)['atlasSize'],
                    padding: (this.fontAtlasGenerator as any)['padding'],
                    spread: (this.fontAtlasGenerator as any)['spread']
                });
            }

            const { texture } = await this.fontAtlasGenerator.generateAtlas(
                'Arial',
                32 // Base font size for SDF
            );
            
            // Configure texture parameters
            texture.minFilter = NearestFilter;
            texture.magFilter = NearestFilter;
            texture.wrapS = ClampToEdgeWrapping;
            texture.wrapT = ClampToEdgeWrapping;
            
            this.fontAtlas = texture;
            
            // Only log atlas generation completion when debugging is enabled
            if (debugState.isDataDebugEnabled()) {
                this.logger.info('Font atlas generated successfully:', {
                    textureWidth: (texture as any).image?.width,
                    textureHeight: (texture as any).image?.height,
                    format: (texture as any).format,
                    mipmaps: (texture as any).mipmaps?.length || 0
                });
            }
            
            // Update all existing labels
            this.labels.forEach((label, id) => {
                this.updateLabel(id, label.text, label.position, label.color);
            });
        } catch (error) {
            this.logger.error('Failed to initialize font atlas:', {
                error,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
        }
    }
    
    private createInstancedGeometry(): BufferGeometry {
        const baseGeometry = new PlaneGeometry(1, 1);
        const instancedGeometry = new BufferGeometry();
        
        // Copy attributes from base geometry
        const position = baseGeometry.getAttribute('position');
        const uv = baseGeometry.getAttribute('uv');
        const normal = baseGeometry.getAttribute('normal');
        
        instancedGeometry.setAttribute('position', position);
        instancedGeometry.setAttribute('uv', uv);
        if (normal) instancedGeometry.setAttribute('normal', normal);
        
        // Set up instanced attributes with proper sizes
        const instancePositions = new Float32Array(this.maxInstances * 3); // vec3
        const instanceColors = new Float32Array(this.maxInstances * 4);    // vec4
        const instanceScales = new Float32Array(this.maxInstances);        // float
        
        // Initialize instance attributes with proper itemSize
        instancedGeometry.setAttribute(
            'instancePosition',
            new InstancedBufferAttribute(instancePositions, 3, false)
        );
        instancedGeometry.setAttribute(
            'instanceColor',
            new InstancedBufferAttribute(instanceColors, 4, false)
        );
        instancedGeometry.setAttribute(
            'instanceScale',
            new InstancedBufferAttribute(instanceScales, 1, false)
        );
        
        // Copy index if present
        const index = (baseGeometry as any).index;
        if (index instanceof BufferAttribute) {
            instancedGeometry.setIndex(index);
        }
        
        // Clean up base geometry
        baseGeometry.dispose();
                
        return instancedGeometry;
    }
    
    /**
     * Update the label for a specific node. 
     * 
     * @param id - Unique ID for the label
     * @param text - Text to display. If empty and preserveText=true, position will be updated but text preserved
     * @param position - 3D position for the label
     * @param color - Optional color for the label
     * @param preserveText - If true and text is empty, existing text will be preserved (position-only update)
     */
    public updateLabel(id: string, text: string, position: Vector3, color?: Color, preserveText: boolean = false): void {
        // Handle empty text cases
        const isEmptyText = !text || text.trim() === '';
        
        // If we have an empty string and we're not preserving text, this is a no-op
        if (isEmptyText && !preserveText) {
            return;
        }
        
        // Check if this is a position-only update (empty text but preserveText flag)
        const isPositionUpdate = isEmptyText && preserveText;
        
        // Find existing label or prepare to create new one
        let label = this.labels.get(id);
        
        // POSITION UPDATE: If this is a position-only update for an existing label
        if (isPositionUpdate && label) {
            // Just update the position and leave everything else untouched
            label.position.copy(position);
            label.lastUpdated = Date.now();
            
            // Debug logging for position updates
            if (debugState.isDataDebugEnabled() && Math.random() < 0.01) { // Log ~1% of updates
                this.logger.debug('Position-only update for label:', {
                    id,
                    text: label.text,
                    posX: position.x,
                    posY: position.y,
                    posZ: position.z
                });
            }
            
            // Update instance attributes to reflect new positions
            this.updateInstanceAttributes();
            return;
        }
        
        // NEW LABEL: If the label doesn't exist yet, create it
        if (!label) {
            // Check if we've hit the instance limit
            if (this.currentInstanceCount >= this.maxInstances) {
                this.logger.warn(`Maximum instance count (${this.maxInstances}) reached, cannot add more labels`);
                return;
            }
            
            // For new labels, we must have actual text content
            if (isEmptyText) {
                // Don't create empty labels
                return;
            }
            
            // Create new label instance
            label = {
                id,
                text,
                position: position.clone(),
                scale: 1.0,
                color: color || new Color(this.settings.textColor),
                visible: true,
                lastUpdated: Date.now()
            };
            
            if (debugState.isDataDebugEnabled()) {
                this.logger.debug('Created new label instance:', {
                    id,
                    text,
                    instanceIndex: this.currentInstanceCount
                });
            }
            
            this.labels.set(id, label);
            this.currentInstanceCount++;
        } 
        // UPDATE EXISTING: Update an existing label
        else {
            // Only update text if we have new non-empty text
            if (!isEmptyText) {
                if (label.text !== text) {
                    if (debugState.isDataDebugEnabled()) {
                        this.logger.debug(`Updated label text: "${label.text}" -> "${text}"`);
                    }
                    label.text = text;
                }
            }
            
            // Always update position
            label.position.copy(position);
            
            // Update color if provided
            if (color) {
                label.color = color;
            }
            
            label.lastUpdated = Date.now();
        }
        
        // Update the instance attributes to reflect changes
        this.updateInstanceAttributes();
    }
    
    private updateInstanceAttributes(): void {
        const positions = (this.geometry.getAttribute('instancePosition') as InstancedBufferAttribute).array as Float32Array;
        const colors = (this.geometry.getAttribute('instanceColor') as InstancedBufferAttribute).array as Float32Array;
        const scales = (this.geometry.getAttribute('instanceScale') as InstancedBufferAttribute).array as Float32Array;

        // Only log updates in debug mode
        if (debugState.isDataDebugEnabled() && Math.random() < 0.01) { // Log ~1% of updates
            this.logger.debug('Updating instance attributes:', {
                currentInstanceCount: this.currentInstanceCount,
                labelsCount: this.labels.size
            });
        }
        
        let index = 0;
        this.labels.forEach(label => {
            if (label.visible) {
                // Copy position data
                positions[index * 3] = label.position.x;
                positions[index * 3 + 1] = label.position.y;
                positions[index * 3 + 2] = label.position.z;
                
                // Copy color data
                const colorArray = label.color.toArray();
                colors.set(colorArray, index * 4);
                colors[index * 4 + 3] = 1.0; // Alpha
                
                // Copy scale data
                scales[index] = label.scale * this.LABEL_SCALE;
                
                index++;
            }
        });
        
        // Set instance count on the mesh
        (this.mesh as any).instanceCount = index;
        
        // Mark attributes as needing update
        (this.geometry.getAttribute('instancePosition') as InstancedBufferAttribute).needsUpdate = true;
        (this.geometry.getAttribute('instanceColor') as InstancedBufferAttribute).needsUpdate = true;
        (this.geometry.getAttribute('instanceScale') as InstancedBufferAttribute).needsUpdate = true;
    }
    
    public removeLabel(id: string): void {
        if (this.labels.delete(id)) {
            this.currentInstanceCount--;
            this.updateInstanceAttributes();
            
            if (debugState.isDataDebugEnabled()) {
                this.logger.debug(`Removed label ${id}`);
            }
        }
    }
    
    public setXRMode(enabled: boolean): void {
        if (enabled) {
            this.group.layers.disable(0);
            this.group.layers.enable(1);
        } else {
            this.group.layers.enable(0);
            this.group.layers.enable(1);
        }
    }
    
    /**
     * Perform per-frame updates for all labels
     */
    public update(): void {
        if (!this.camera || !this.material) return;
        
        // For camera billboard mode: Ensure all labels remain visible
        if (this.settings.billboardMode === 'camera') {
            this.labels.forEach(label => {
                label.visible = true;
            });
        } else {
            // For other modes: Update visibility based on camera position
            this.labels.forEach(label => label.visible = this.isLabelVisible(label));
        }

        this.updateInstanceAttributes();
    }

    private isLabelVisible(label: LabelInstance): boolean {
        if (!label.visible) return false;
        
        // When billboard_mode is "camera", don't cull labels based on position relative to camera
        // This ensures labels are visible regardless of which side of the origin they're on
        if (this.settings.billboardMode === 'camera') {
            return true;
        }
        
        // For other billboard modes, use distance-based culling with the camera's far plane
        const distanceToCamera = label.position.distanceTo(this.camera.position);
        const margin = 5.0;  // Units in world space
        
        // Check if label is within camera's view distance (with margin)
        return distanceToCamera <= (this.camera as any).far + margin;
    }

    public dispose(): void {
        this.geometry.dispose();
        if (this.material) {
            this.material.dispose();
        }
        if (this.fontAtlas) {
            this.fontAtlas.dispose();
        }
        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}
