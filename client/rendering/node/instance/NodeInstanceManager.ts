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
import { createLogger } from '../../../core/logger';

const logger = createLogger('NodeInstanceManager');

// Constants for optimization
const MAX_INSTANCES = 10000;
const VISIBILITY_UPDATE_INTERVAL = 10; // frames

// Reusable objects for matrix calculations
const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const velocity = new Vector3();
const scale = new Vector3(1, 1, 1);

// Visibility states (using setRGB for proper initialization)
const VISIBLE = new Color(0xffffff);
const INVISIBLE = new Color(0x000000);

interface NodeUpdate {
    id: string;
    position: [number, number, number];
    velocity?: [number, number, number];
}

export class NodeInstanceManager {
    private static instance: NodeInstanceManager;
    private scene: Scene;
    private nodeInstances: InstancedMesh;
    private geometryManager: NodeGeometryManager;
    private nodeIndices: Map<string, number> = new Map();
    private pendingUpdates: Set<number> = new Set();
    private frameCount: number = 0;
    private updateScheduled: boolean = false;
    private velocities: Map<number, Vector3> = new Map();
    private lastUpdateTime: number = performance.now();

    private constructor(scene: Scene, material: Material) {
        this.scene = scene;
        this.geometryManager = NodeGeometryManager.getInstance();

        // Initialize InstancedMesh with high-detail geometry
        const initialGeometry = this.geometryManager.getGeometryForDistance(0);
        this.nodeInstances = new InstancedMesh(initialGeometry, material, MAX_INSTANCES);
        this.nodeInstances.count = 0; // Start with 0 visible instances
        this.nodeInstances.frustumCulled = true;
        this.nodeInstances.layers.enable(0); // Enable default layer

        // Add to scene
        this.scene.add(this.nodeInstances);
        logger.info('Initialized NodeInstanceManager');
    }

    public static getInstance(scene: Scene, material: Material): NodeInstanceManager {
        if (!NodeInstanceManager.instance) {
            NodeInstanceManager.instance = new NodeInstanceManager(scene, material);
        }
        return NodeInstanceManager.instance;
    }

    public updateNodePositions(updates: NodeUpdate[]): void {
        updates.forEach(update => {
            const index = this.nodeIndices.get(update.id);
            if (index === undefined) {
                // New node
                const newIndex = this.nodeInstances.count;
                if (newIndex < MAX_INSTANCES) {
                    this.nodeIndices.set(update.id, newIndex);
                    this.nodeInstances.count++;
                    
                    // Set initial position
                    position.fromArray(update.position);
                    matrix.compose(position, quaternion, scale);
                    if (update.velocity) {
                        const vel = new Vector3().fromArray(update.velocity);
                        this.velocities.set(newIndex, vel);
                    }
                    this.nodeInstances.setMatrixAt(newIndex, matrix);
                    this.nodeInstances.setColorAt(newIndex, VISIBLE);
                    
                    this.pendingUpdates.add(newIndex);
                    logger.debug(`Added new node at index ${newIndex}`);
                } else {
                    logger.warn('Maximum instance count reached, cannot add more nodes');
                }
                return;
            }

            // Update existing node
            position.fromArray(update.position);
            if (update.velocity) {
                const vel = new Vector3().fromArray(update.velocity);
                this.velocities.set(index, vel);
            }
            matrix.compose(position, quaternion, scale);
            this.nodeInstances.setMatrixAt(index, matrix);
            this.pendingUpdates.add(index);
        });

        if (this.pendingUpdates.size > 0) {
            this.scheduleBatchUpdate();
        }
    }

    private scheduleBatchUpdate(): void {
        if (this.updateScheduled) return;
        this.updateScheduled = true;

        requestAnimationFrame(() => {
            this.processBatchUpdate();
            this.updateScheduled = false;

            if (this.pendingUpdates.size > 0) {
                this.scheduleBatchUpdate();
            }
        });
    }

    private processBatchUpdate(): void {
        if (this.pendingUpdates.size > 0) {
            // Update all pending changes
            this.nodeInstances.instanceMatrix.needsUpdate = true;
            if (this.nodeInstances.instanceColor) {
                this.nodeInstances.instanceColor.needsUpdate = true;
            }
            this.pendingUpdates.clear(); // Clear all pending updates
        }
    }

    public update(camera: Camera, passedDeltaTime?: number): void {
        this.frameCount++;
        
        // Update positions based on velocity
        const currentTime = performance.now();
        const deltaTime = passedDeltaTime !== undefined ? 
            passedDeltaTime : 
            (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;

        // Update positions based on velocities
        this.velocities.forEach((nodeVelocity, index) => {
            if (nodeVelocity.lengthSq() > 0) {
                this.nodeInstances.getMatrixAt(index, matrix);
                position.setFromMatrixPosition(matrix);
                
                // Apply velocity
                velocity.copy(nodeVelocity).multiplyScalar(deltaTime);
                position.add(velocity);
                
                // Update matrix
                matrix.compose(position, quaternion, scale);
                this.nodeInstances.setMatrixAt(index, matrix);
                this.pendingUpdates.add(index);
            }
        });

        // Update visibility and LOD every N frames
        if (this.frameCount % VISIBILITY_UPDATE_INTERVAL === 0) {
            this.updateVisibilityAndLOD(camera);
        }
    }

    private updateVisibilityAndLOD(camera: Camera): void {
        const cameraPosition = camera.position;
        
        // Check each instance
        for (let i = 0; i < this.nodeInstances.count; i++) {
            this.nodeInstances.getMatrixAt(i, matrix);
            position.setFromMatrixPosition(matrix);
            
            const distance = position.distanceTo(cameraPosition);
            
            // Update geometry based on distance
            void this.geometryManager.getGeometryForDistance(distance); // Keep LOD calculation for future use

            // Update visibility
            const visible = distance < this.geometryManager.getThresholdForLOD(LODLevel.LOW);
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
        // Reset the singleton instance
        NodeInstanceManager.instance = null!;
        logger.info('Disposed NodeInstanceManager');
    }

    public getInstanceMesh(): InstancedMesh {
        return this.nodeInstances;
    }

    /**
     * Get node ID from instance index
     * @param index Instance index in the InstancedMesh
     * @returns Node ID or undefined if not found
     */
    public getNodeId(index: number): string | undefined {
        // Find the node ID that maps to this index
        return Array.from(this.nodeIndices.entries()).find(([_, idx]) => idx === index)?.[0];
    }

    /**
     * Get current position of a node by its ID
     * @param nodeId The ID of the node
     * @returns Vector3 position or undefined if node not found
     */
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