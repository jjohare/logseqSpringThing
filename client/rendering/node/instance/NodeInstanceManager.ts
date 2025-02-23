import {
    Scene,
    InstancedMesh,
    Matrix4,
    Vector3,
    Quaternion,
    Color,
    Camera,
    Material
} from 'three';
import { NodeGeometryManager, LODLevel } from '../geometry/NodeGeometryManager';
import { createLogger, createDataMetadata } from '../../../core/logger';
import { SettingsStore } from '../../../state/SettingsStore';
import { NodeSettings } from '../../../types/settings/base';
import { scaleOps } from '../../../core/utils';
import { Node } from '../../../core/types';
import { debugState } from '../../../core/debugState';

const logger = createLogger('NodeInstanceManager');

// Constants for optimization
const MAX_INSTANCES = 10000;
const VISIBILITY_UPDATE_INTERVAL = 10; // frames
const DEFAULT_FILE_SIZE = 1000; // 1KB default
const MAX_FILE_SIZE = 10485760; // 10MB max for scaling

// Reusable objects for matrix calculations
const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const velocity = new Vector3();
const scale = new Vector3();

// Visibility states (using setRGB for proper initialization)
const VISIBLE = new Color(0xffffff);
const INVISIBLE = new Color(0x000000);

interface NodeUpdate {
    id: string;
    position: Vector3;  // Three.js Vector3
    velocity?: Vector3; // Three.js Vector3
    metadata?: {
        name?: string;
        lastModified?: number;
        links?: string[];
        references?: string[];
        fileSize?: number;
        hyperlinkCount?: number;
    };
}

export class NodeInstanceManager {
    private static instance: NodeInstanceManager;
    private scene: Scene;
    private nodeInstances: InstancedMesh;
    private geometryManager: NodeGeometryManager;
    private nodeIndices: Map<string, number> = new Map();
    private pendingUpdates: Set<number> = new Set();
    private frameCount: number = 0;
    private velocities: Map<number, Vector3> = new Map();
    private lastUpdateTime: number = performance.now();
    private settingsStore: SettingsStore;
    private nodeSettings: NodeSettings;
    private readonly MAX_POSITION = 1000.0; // Reasonable limit for graph visualization
    private readonly MAX_VELOCITY = 100.0;   // Increased maximum allowed velocity value
    private isReady: boolean = false;

    private validateAndLogVector3(vec: Vector3, max: number, context: string, nodeId?: string): boolean {
        const isValid = this.validateVector3(vec, max);
        
        if (!isValid && debugState.isNodeDebugEnabled()) {
            logger.node('Vector3 validation failed', createDataMetadata({
                nodeId,
                component: context,
                maxAllowed: max,
                position: { x: vec.x, y: vec.y, z: vec.z },
                invalidReason: !isFinite(vec.x) || !isFinite(vec.y) || !isFinite(vec.z) ? 
                    'Non-finite values detected' : 
                    isNaN(vec.x) || isNaN(vec.y) || isNaN(vec.z) ?
                    'NaN values detected' :
                    'Values exceed maximum bounds'
            }));
        }
        
        return isValid;
    }

    private validateVector3(vec: Vector3, max: number): boolean {
        return !isNaN(vec.x) && !isNaN(vec.y) && !isNaN(vec.z) &&
               isFinite(vec.x) && isFinite(vec.y) && isFinite(vec.z) &&
               Math.abs(vec.x) <= max && Math.abs(vec.y) <= max && Math.abs(vec.z) <= max;
    }

    private validateMatrix4(mat: Matrix4, nodeId: string): boolean {
        const elements = mat.elements;
        for (let i = 0; i < 16; i++) {
            if (!isFinite(elements[i]) || isNaN(elements[i])) {
                if (debugState.isMatrixDebugEnabled()) {
                    logger.matrix('Invalid matrix element detected', createDataMetadata({
                        nodeId,
                        elementIndex: i,
                        value: elements[i],
                        matrix: elements.join(',')
                    }));
                }
                return false;
            }
        }
        return true;
    }

    private constructor(scene: Scene, material: Material) {
        this.scene = scene;
        this.geometryManager = NodeGeometryManager.getInstance();
        this.settingsStore = SettingsStore.getInstance();
        
        // Wait for settings to be fully initialized
        if (!this.settingsStore.isInitialized()) {
            if (debugState.isEnabled()) {
                logger.warn('SettingsStore not initialized, using defaults');
            }
            this.nodeSettings = this.settingsStore.get('visualization.nodes') as NodeSettings;
        } else {
            this.nodeSettings = this.settingsStore.get('visualization.nodes') as NodeSettings;
        }

        // Initialize InstancedMesh with high-detail geometry
        const initialGeometry = this.geometryManager.getGeometryForDistance(0);
        
        // Validate initial geometry
        if (debugState.isNodeDebugEnabled()) {
            const posAttr = initialGeometry.getAttribute('position');
            const normalAttr = initialGeometry.getAttribute('normal');
            logger.node('Validating initial geometry', createDataMetadata({
                vertexCount: posAttr?.count ?? 0,
                attributes: `position:${!!posAttr},normal:${!!normalAttr}`
            }));
        }

        this.nodeInstances = new InstancedMesh(initialGeometry, material, MAX_INSTANCES);
        
        // Validate initial instance matrix
        const initialMatrix = new Matrix4();
        this.validateMatrix4(initialMatrix, 'initial');
        
        this.nodeInstances.count = 0; // Start with 0 visible instances
        this.nodeInstances.frustumCulled = true;
        this.nodeInstances.layers.enable(0); // Enable default layer

        // Add to scene
        this.scene.add(this.nodeInstances);
        if (debugState.isEnabled()) {
            logger.info('Initialized NodeInstanceManager');
        }

        // Subscribe to settings changes
        this.settingsStore.subscribe('visualization.nodes', (_: string, settings: any) => {
            if (settings && typeof settings === 'object') {
                this.nodeSettings = settings as NodeSettings;
                this.updateAllNodeScales();
            }
        });

        // Mark as ready after initialization
        this.isReady = true;
    }

    public static getInstance(scene: Scene, material: Material): NodeInstanceManager {
        if (!NodeInstanceManager.instance) {
            NodeInstanceManager.instance = new NodeInstanceManager(scene, material);
        }
        return NodeInstanceManager.instance;
    }

    public isInitialized(): boolean {
        return this.isReady;
    }

    private getNodeScale(node: Node): number {
        if (debugState.isNodeDebugEnabled()) {
            logger.node('Calculating node scale', createDataMetadata({
                nodeId: node.id,
                metadata: node.data.metadata
            }));
        }

        let normalizedSize = 0;
        const [minSize = 1, maxSize = 5] = this.nodeSettings?.sizeRange || [1, 5];

        if (!this.nodeSettings) {
            return 1.0; // Default scale if settings not available
        }

        try {
            const fileSize = node.data.metadata?.fileSize ?? DEFAULT_FILE_SIZE;
            // Clamp file size to reasonable bounds
            const clampedSize = Math.min(Math.max(fileSize, 0), MAX_FILE_SIZE);
            // Calculate normalized size (0-1)
            normalizedSize = clampedSize / MAX_FILE_SIZE;
        } catch (error) {
            if (debugState.isNodeDebugEnabled()) {
                logger.node('Error calculating normalized size', createDataMetadata({
                    nodeId: node.id,
                    error: error instanceof Error ? error.message : String(error)
                }));
            }
        }
        
        // Map the normalized size to the configured size range
        const scale = scaleOps.mapRange(normalizedSize, 0, 1, minSize, maxSize);
        
        // Ensure scale is valid
        return isFinite(scale) && !isNaN(scale) ? scale : 1.0;
    }

    private updateAllNodeScales(): void {
        if (!this.isReady) {
            if (debugState.isEnabled()) {
                logger.warn('Attempted to update scales before initialization');
            }
            return;
        }

        // Update all existing nodes with new scale based on current settings
        for (let i = 0; i < this.nodeInstances.count; i++) {
            this.nodeInstances.getMatrixAt(i, matrix);
            matrix.decompose(position, quaternion, scale);
            
            // Get the node ID for this instance
            const nodeId = this.getNodeId(i);
            if (!nodeId) continue;
            
            // Find the node data
            const node = Array.from(this.nodeIndices.entries())
                .find(([_, idx]) => idx === i)?.[0];
            if (!node) continue;

            // Calculate new scale
            const newScale = this.getNodeScale({ 
                id: nodeId, 
                data: { 
                    position: position.clone(),
                    velocity: new Vector3(0, 0, 0)
                }
            });
            scale.set(newScale, newScale, newScale);
            
            matrix.compose(position, quaternion, scale);
            this.nodeInstances.setMatrixAt(i, matrix);
            this.pendingUpdates.add(i);
        }
        
        if (this.pendingUpdates.size > 0) {
            this.nodeInstances.instanceMatrix.needsUpdate = true;
            this.pendingUpdates.clear();
        }
    }

    public updateNodePositions(updates: NodeUpdate[]): void {
        if (!this.isReady) {
            if (debugState.isEnabled()) {
                logger.warn('Attempted to update positions before initialization');
            }
            return;
        }

        if (debugState.isNodeDebugEnabled()) {
            logger.node('Starting node position updates', createDataMetadata({
                updateCount: updates.length,
                nodes: updates.map(u => u.id).join(',')
            }));
        }

        let updatedCount = 0;
        updates.forEach(update => {
            const index = this.nodeIndices.get(update.id);
            
            // Validate and clamp position
            position.copy(update.position); // Using Three.js Vector3 copy
            if (!this.validateAndLogVector3(position, this.MAX_POSITION, 'position', update.id)) {
                if (debugState.isNodeDebugEnabled()) {
                    logger.node('Position validation failed, attempting recovery', createDataMetadata({
                        nodeId: update.id,
                        originalPosition: { x: position.x, y: position.y, z: position.z }
                    }));
                }
                if (debugState.isEnabled()) {
                    logger.warn(`Invalid position for node ${update.id}, clamping to valid range`);
                }
                position.x = Math.max(-this.MAX_POSITION, Math.min(this.MAX_POSITION, position.x));
                position.y = Math.max(-this.MAX_POSITION, Math.min(this.MAX_POSITION, position.y));
                position.z = Math.max(-this.MAX_POSITION, Math.min(this.MAX_POSITION, position.z));
            }

            // Validate and clamp velocity if present
            if (update.velocity) {
                velocity.copy(update.velocity); // Using Three.js Vector3 copy
                if (!this.validateAndLogVector3(velocity, this.MAX_VELOCITY, 'velocity', update.id)) {
                    if (debugState.isNodeDebugEnabled()) {
                        logger.node('Velocity validation failed, attempting recovery', createDataMetadata({
                            nodeId: update.id,
                            originalVelocity: { x: velocity.x, y: velocity.y, z: velocity.z }
                        }));
                    }
                    if (debugState.isEnabled()) {
                        logger.warn(`Invalid velocity for node ${update.id}, clamping to valid range`);
                    }
                    velocity.x = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, velocity.x));
                    velocity.y = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, velocity.y));
                    velocity.z = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, velocity.z));
                }
            }

            if (index === undefined) {
                // New node
                const newIndex = this.nodeInstances.count;
                if (newIndex < MAX_INSTANCES) {
                    this.nodeIndices.set(update.id, newIndex);
                    this.nodeInstances.count++;

                    // Calculate scale based on node properties
                    const scaleValue = this.getNodeScale({
                        id: update.id,
                        data: {
                            position: position.clone(),
                            velocity: new Vector3(0, 0, 0),
                            metadata: update.metadata
                        }
                    });
                    scale.set(scaleValue, scaleValue, scaleValue);
                    
                    if (update.velocity) {
                        const vel = update.velocity.clone(); // Using Three.js Vector3 clone
                        this.velocities.set(newIndex, vel);
                    }
                    
                    matrix.compose(position, quaternion, scale);
                    
                    // Validate matrix before setting
                    if (!this.validateMatrix4(matrix, update.id)) {
                        if (debugState.isMatrixDebugEnabled()) {
                            logger.matrix('Invalid matrix after composition', createDataMetadata({
                                nodeId: update.id,
                                position: {
                                    x: position.x,
                                    y: position.y,
                                    z: position.z
                                },
                                scale: {
                                    x: scale.x, y: scale.y, z: scale.z
                                }
                            }));
                        }
                        return;
                    }
                    
                    this.nodeInstances.setMatrixAt(newIndex, matrix);
                    this.nodeInstances.setColorAt(newIndex, VISIBLE);
                    
                    this.pendingUpdates.add(newIndex);
                    updatedCount++;
                } else {
                    if (debugState.isEnabled()) {
                        logger.warn('Maximum instance count reached, cannot add more nodes');
                    }
                }
                return;
            }

            // Update existing node
            if (update.velocity) {
                this.velocities.set(index, velocity.clone());
            }
            
            // Calculate scale based on node properties
            const scaleValue = this.getNodeScale({
                id: update.id,
                data: {
                    position: position.clone(),
                    velocity: new Vector3(0, 0, 0),
                    metadata: update.metadata
                }
            });
            scale.set(scaleValue, scaleValue, scaleValue);
            
            matrix.compose(position, quaternion, scale);
            
            // Validate matrix before setting
            if (!this.validateMatrix4(matrix, update.id)) {
                if (debugState.isMatrixDebugEnabled()) {
                    logger.matrix('Invalid matrix after composition', createDataMetadata({
                        nodeId: update.id,
                        position: {
                            x: position.x,
                            y: position.y,
                            z: position.z
                        },
                        scale: {
                            x: scale.x, y: scale.y, z: scale.z
                        }
                    }));
                }
                return;
            }
            
            this.nodeInstances.setMatrixAt(index, matrix);
            this.pendingUpdates.add(index);
            updatedCount++;
        });

        if (this.pendingUpdates.size > 0) {
            this.nodeInstances.instanceMatrix.needsUpdate = true;
            if (debugState.isDataDebugEnabled()) {
                logger.debug(`Updated ${updatedCount} nodes`);
            }
            this.pendingUpdates.clear();
        }
    }

    public update(camera: Camera, passedDeltaTime?: number): void {
        if (!this.isReady) return;

        // Validate deltaTime
        if (passedDeltaTime !== undefined && 
            (!isFinite(passedDeltaTime) || isNaN(passedDeltaTime) || passedDeltaTime <= 0)) {
            if (debugState.isPhysicsDebugEnabled()) {
                logger.physics('Invalid deltaTime provided', createDataMetadata({ deltaTime: passedDeltaTime }));
            }
            return;
        }

        this.frameCount++;
        
        // Update positions based on velocity
        const currentTime = performance.now();
        const deltaTime = passedDeltaTime !== undefined ? 
            passedDeltaTime : 
            (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;

        if (debugState.isPhysicsDebugEnabled()) {
            logger.physics('Starting physics update', createDataMetadata({
                deltaTime,
                velocityCount: this.velocities.size
            }));
        }

        // Update positions based on velocities
        this.velocities.forEach((nodeVelocity, index) => {
            if (nodeVelocity.lengthSq() > 0) {
                this.nodeInstances.getMatrixAt(index, matrix);
                matrix.decompose(position, quaternion, scale);
                
                // Apply velocity
                velocity.copy(nodeVelocity).multiplyScalar(deltaTime);
                position.add(velocity);

                // Validate position after velocity update
                if (!this.validateAndLogVector3(position, this.MAX_POSITION, 'physics-update')) {
                    if (debugState.isPhysicsDebugEnabled()) {
                        logger.physics('Invalid position after velocity update', createDataMetadata({
                            nodeId: this.getNodeId(index),
                            position: {
                                x: position.x,
                                y: position.y,
                                z: position.z
                            },
                            velocity: {
                                x: velocity.x, y: velocity.y, z: velocity.z
                            }
                        }));
                    }
                    // Extract position from matrix and reset
                    position.setFromMatrixPosition(matrix);
                }                
                
                // Update matrix
                matrix.compose(position, quaternion, scale);
                
                // Validate matrix before setting
                if (!this.validateMatrix4(matrix, this.getNodeId(index) || 'unknown')) {
                    return;
                }
                
                this.nodeInstances.setMatrixAt(index, matrix);
                this.pendingUpdates.add(index);
            }
        });

        // Update visibility and LOD every N frames
        if (this.frameCount % VISIBILITY_UPDATE_INTERVAL === 0) {
            this.updateVisibilityAndLOD(camera);
        }

        if (this.pendingUpdates.size > 0) {
            this.nodeInstances.instanceMatrix.needsUpdate = true;
            this.pendingUpdates.clear();
        }
    }

    private updateVisibilityAndLOD(camera: Camera): void {
        if (!this.isReady) return;

        const cameraPosition = camera.position;
        
        // Check each instance
        for (let i = 0; i < this.nodeInstances.count; i++) {
            this.nodeInstances.getMatrixAt(i, matrix);
            position.setFromMatrixPosition(matrix);
            
            const distance = position.distanceTo(cameraPosition);
            
            // Update geometry based on distance
            void this.geometryManager.getGeometryForDistance(distance);

            // Show nodes within the maximum LOD distance
            const visible = distance <= this.geometryManager.getThresholdForLOD(LODLevel.LOW);
            this.nodeInstances.setColorAt(i, visible ? VISIBLE : INVISIBLE);
        }

        // Ensure updates are applied
        if (this.nodeInstances.instanceColor) {
            this.nodeInstances.instanceColor.needsUpdate = true;
        }
    }

    public dispose(): void {
        if (this.nodeInstances) {
            this.nodeInstances.geometry.dispose();
            this.scene.remove(this.nodeInstances);
        }
        this.nodeIndices.clear();
        this.pendingUpdates.clear();
        this.velocities.clear();
        this.isReady = false;
        NodeInstanceManager.instance = null!;
        if (debugState.isEnabled()) {
            logger.info('Disposed NodeInstanceManager');
        }
    }

    public getInstanceMesh(): InstancedMesh {
        return this.nodeInstances;
    }

    public getNodeId(index: number): string | undefined {
        return Array.from(this.nodeIndices.entries())
            .find(([_, idx]) => idx === index)?.[0];
    }

    public getNodePosition(nodeId: string): Vector3 | undefined {
        const index = this.nodeIndices.get(nodeId);
        if (index !== undefined) {
            this.nodeInstances.getMatrixAt(index, matrix);
            const position = new Vector3();
            position.setFromMatrixPosition(matrix);
            return position;
        }
        return undefined;
    }
}