import {
    BufferGeometry,
    BufferAttribute,
    LineBasicMaterial,
    Mesh,
    Scene,
    Vector3,
    Material
} from 'three';
import { createLogger } from '../core/logger';
import { Edge } from '../core/types';
import { Settings } from '../types/settings';
import { NodeInstanceManager } from './node/instance/NodeInstanceManager';
import { EdgeShaderMaterial } from './materials/EdgeShaderMaterial';

const logger = createLogger('EdgeManager');

export class EdgeManager {
    private scene: Scene;
    private settings: Settings;
    private edges: Map<string, Mesh> = new Map(); // Store edges by ID
    private nodeInstanceManager: NodeInstanceManager; // Reference to NodeInstanceManager

    constructor(scene: Scene, settings: Settings, nodeInstanceManager: NodeInstanceManager) {
        this.scene = scene;
        this.settings = settings;
        this.nodeInstanceManager = nodeInstanceManager;
        logger.info('EdgeManager initialized');
        
        // Add constructor validation
        if (!this.scene) {
            logger.error("Scene is null or undefined in EdgeManager constructor");
        }
        if (!this.settings) {
            logger.error("Settings are null or undefined in EdgeManager constructor");
        }
        if (!this.nodeInstanceManager) {
            logger.error("NodeInstanceManager is null or undefined in EdgeManager constructor");
        }
    }

    /**
     * Validates a Vector3 to ensure it has valid, finite values
     */
    private validateVector3(vec: Vector3): boolean {
        const MAX_VALUE = 1000;
        return isFinite(vec.x) && isFinite(vec.y) && isFinite(vec.z) &&
             !isNaN(vec.x) && !isNaN(vec.y) && !isNaN(vec.z) &&
             Math.abs(vec.x) < MAX_VALUE && Math.abs(vec.y) < MAX_VALUE && Math.abs(vec.z) < MAX_VALUE;
    }

    public updateEdges(edges: Edge[]): void {
        logger.info(`Updating ${edges.length} edges, current edge count: ${this.edges.size}`);

        const newEdges: Edge[] = [];
        const existingEdges: Edge[] = [];

        const currentEdgeIds = new Set(edges.map(edge => this.createEdgeId(edge.source, edge.target)));
        for (const edge of edges) {
            // Use numeric IDs for edge identification
            const edgeId = this.createEdgeId(edge.source, edge.target);

            logger.debug(`Checking edge: ${edgeId}`);

            if (this.edges.has(edgeId)) {
                existingEdges.push(edge);
            } else {
                newEdges.push(edge);
            }
        }

        logger.debug(`Found ${newEdges.length} new edges and ${existingEdges.length} existing edges`);

        // Add new edges
        for (const edge of newEdges) {
            logger.debug(`Creating edge: ${edge.source}-${edge.target}`);
            this.createEdge(edge);
        }

        // Update existing edges (positions might have changed)
        for (const edge of existingEdges) {
            logger.debug(`Updating edge: ${edge.source}-${edge.target}`);
            this.updateEdge(edge);
        }

        // Remove old edges (not in the new set)
        for (const edgeId of this.edges.keys()) {
            if (!currentEdgeIds.has(edgeId)) {
                this.removeEdge(edgeId);
            }
        }
    }
  
    private createEdge(edge: Edge): void {
        const edgeId = this.createEdgeId(edge.source, edge.target);

        // Validate source and target IDs - they should be numeric strings
        if (!this.validateNodeId(edge.source) || !this.validateNodeId(edge.target)) {
            logger.warn(`Skipping edge creation with invalid node IDs: source=${edge.source}, target=${edge.target}`);
            return;
        }
        // Get node positions from NodeInstanceManager using numeric IDs
        const sourcePos = this.nodeInstanceManager.getNodePosition(edge.source);
        const targetPos = this.nodeInstanceManager.getNodePosition(edge.target);
        
        logger.debug(`Creating edge ${edgeId}`, { 
            source: edge.source,
            target: edge.target,
            sourcePos: sourcePos ? [sourcePos.x, sourcePos.y, sourcePos.z] : null,
            targetPos: targetPos ? [targetPos.x, targetPos.y, targetPos.z] : null
        });

        if (!sourcePos || !targetPos) {
            logger.warn(`Skipping edge creation for ${edgeId} due to missing node positions. Source exists: ${!!sourcePos}, Target exists: ${!!targetPos}`);
            return;
        }

        const isSourceValid = this.validateVector3(sourcePos);
        const isTargetValid = this.validateVector3(targetPos);

        if (!isSourceValid || !isTargetValid) {
            logger.warn(`Skipping edge creation for ${edgeId} due to invalid node positions. Source valid: ${isSourceValid}, Target valid: ${isTargetValid}`);
            if (!isSourceValid) {
                logger.warn(`Invalid source position: [${sourcePos.x}, ${sourcePos.y}, ${sourcePos.z}]`);
            }
            if (!isTargetValid) {
                logger.warn(`Invalid target position: [${targetPos.x}, ${targetPos.y}, ${targetPos.z}]`);
            }
            return;
        }

        // Create a simple line geometry
        const geometry = new BufferGeometry();
        const positions = new Float32Array([
            sourcePos.x, sourcePos.y, sourcePos.z,
            targetPos.x, targetPos.y, targetPos.z
        ]);
        
        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        
        // Try to use EdgeShaderMaterial if available for better visibility
        let material;
        try {
            material = new EdgeShaderMaterial(this.settings);
            material.setSourceTarget(sourcePos, targetPos);
        } catch (error) {
            // Fallback to LineBasicMaterial
            material = new LineBasicMaterial({
                color: this.settings.visualization.edges.color || "#888888", 
                transparent: true, 
                opacity: this.settings.visualization.edges.opacity || 0.8,
                depthWrite: false // Ensure edges render correctly by disabling depth writing
            });
            logger.warn(`Failed to create EdgeShaderMaterial, falling back to LineBasicMaterial: ${error}`);
        }

        // Use Mesh with line geometry for rendering
        const line = new Mesh(geometry, material);
        line.renderOrder = 10; // Increased to render on top of nodes

        // Store the edge ID in userData for identification
        line.userData = { edgeId };
        
        // Enable both layers by default for desktop mode
        line.layers.enable(0);
        line.layers.enable(1);
        
        this.edges.set(edgeId, line);
        
        // Add to scene and check
        this.scene.add(line);
        
        // Verify the edge was added to the scene
        logger.debug(`Edge created: ${edgeId}, visible: ${line.visible}, layers: ${line.layers.mask}, renderOrder: ${line.renderOrder}`);
    }

    /**
     * Creates a consistent edge ID by sorting source and target IDs
     * This ensures the same ID regardless of edge direction
     */
    private createEdgeId(source: string, target: string): string {
        return [source, target].sort().join('_');
    }

    private validateNodeId(id: string): boolean {
        return id !== undefined && id !== null && /^\d+$/.test(id);
    }

    private updateEdge(edge: Edge): void {
        const edgeId = this.createEdgeId(edge.source, edge.target);
        const line = this.edges.get(edgeId);

        if (!line) {
            this.createEdge(edge);
            return;
        }

        const sourcePos = this.nodeInstanceManager.getNodePosition(edge.source);
        const targetPos = this.nodeInstanceManager.getNodePosition(edge.target);

        if (!sourcePos || !targetPos) {
            logger.warn(`Cannot update edge ${edgeId}: node positions not found`);
            return;
        }

        // Create valid source and target vectors - cloning to avoid modifying the original vectors
        const validatedSource = sourcePos.clone();
        const validatedTarget = targetPos.clone();

        // Make sure positions are valid
        if (!this.validateVector3(validatedSource) || !this.validateVector3(validatedTarget)) {
            // Fix any invalid values
            this.fixVector3IfNeeded(validatedSource);
            this.fixVector3IfNeeded(validatedTarget);
        }

        // Update the position attribute directly
        const positionAttribute = line.geometry.getAttribute('position');
        this.updatePositionAttribute(positionAttribute, validatedSource, validatedTarget);
        positionAttribute.needsUpdate = true;

        // Update material source/target if it's EdgeShaderMaterial
        if (line.material instanceof EdgeShaderMaterial) {
            line.material.setSourceTarget(validatedSource, validatedTarget);
        }
    }

    private removeEdge(edgeId: string): void {
        const edge = this.edges.get(edgeId);
        if (edge) {
            logger.debug(`Removing edge: ${edgeId}`);
            this.scene.remove(edge);
            edge.geometry.dispose();
            if (Array.isArray(edge.material)) {
                logger.debug(`Disposing ${edge.material.length} materials for edge ${edgeId}`);
                edge.material.forEach((m: Material) => m.dispose());
            } else {
                logger.debug(`Disposing material for edge ${edgeId}`);
                edge.material.dispose();
            }
            this.edges.delete(edgeId);
        } else {
            logger.warn(`Attempted to remove non-existent edge: ${edgeId}`);
        }
    }

    public handleSettingsUpdate(settings: Settings): void {
        this.settings = settings;
        // Update edge appearance based on new settings
        this.edges.forEach((edge) => {
            if (edge.material instanceof LineBasicMaterial || edge.material instanceof EdgeShaderMaterial) {
                edge.material.color.set(this.settings.visualization.edges.color);
                edge.material.opacity = this.settings.visualization.edges.opacity;
                edge.material.needsUpdate = true;
                edge.renderOrder = 10; // Ensure it's still rendering on top
            }
        });
    }

    /**
     * Set XR mode for edge rendering
     */
    public setXRMode(enabled: boolean): void {
        // Set appropriate layer visibility for all edges
        logger.info(`Setting XR mode for ${this.edges.size} edges: ${enabled ? 'enabled' : 'disabled'}`);
        this.edges.forEach(edge => {
            if (enabled) {
                // In XR mode, only show on layer 1
                edge.layers.disable(0);
                edge.layers.enable(1);
            } else {
                // In desktop mode, show on both layers
                edge.layers.enable(0);
                edge.layers.enable(1);
            }
        });
    }

    public update(): void {
        // Update edge animations if using EdgeShaderMaterial
        const deltaTime = 1/60; // Default to 60fps for animation timing
        
        // Update edge positions based on current node positions
        this.updateEdgePositions();
        
        this.edges.forEach(edge => {
            if (edge.material instanceof EdgeShaderMaterial && edge.material.update) {
                edge.material.update(deltaTime);
            }
        });
    }
    
    /**
     * Updates all edge positions based on current node positions
     * Should be called in the render loop to ensure edges follow nodes
     */
    private updateEdgePositions(): void {
        this.edges.forEach((line, edgeId) => {
            const [sourceId, targetId] = edgeId.split('_');
            
            const sourcePos = this.nodeInstanceManager.getNodePosition(sourceId);
            const targetPos = this.nodeInstanceManager.getNodePosition(targetId);
            
            if (sourcePos && targetPos && this.validateVector3(sourcePos) && this.validateVector3(targetPos)) {
                const positionAttribute = line.geometry.getAttribute('position');
                this.updatePositionAttribute(positionAttribute, sourcePos, targetPos);
                positionAttribute.needsUpdate = true;
            }
        });
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        // Dispose of all geometries and materials
        this.edges.forEach(edge => {
            this.scene.remove(edge);
            edge.geometry.dispose();
            if (Array.isArray(edge.material)) {
                edge.material.forEach((m: Material) => m.dispose());
            } else {
                edge.material.dispose();
            }
        });
        this.edges.clear();
    }
    
    /**
     * Updates a position buffer attribute with new source and target positions
     * @param attribute The position buffer attribute to update
     * @param source The source node position
     * @param target The target node position
     */
    private updatePositionAttribute(attribute: BufferAttribute, source: Vector3, target: Vector3): void {
        if (!attribute) return;

        // Update source position (first vertex)
        attribute.setXYZ(0, source.x, source.y, source.z);

        // Update target position (second vertex)
        attribute.setXYZ(1, target.x, target.y, target.z);
    }

    /**
     * Fix a Vector3 if it contains invalid values
     */
    private fixVector3IfNeeded(vec: Vector3): void {
        const MAX_VALUE = 1000;
        vec.x = isFinite(vec.x) && !isNaN(vec.x) ? Math.min(Math.max(vec.x, -MAX_VALUE), MAX_VALUE) : 0;
        vec.y = isFinite(vec.y) && !isNaN(vec.y) ? Math.min(Math.max(vec.y, -MAX_VALUE), MAX_VALUE) : 0;
        vec.z = isFinite(vec.z) && !isNaN(vec.z) ? Math.min(Math.max(vec.z, -MAX_VALUE), MAX_VALUE) : 0;
    }
}
