import {
    Scene,
    Camera,
    Material,
    InstancedMesh
} from 'three';
import { NodeGeometryManager } from './geometry/NodeGeometryManager';
import { NodeInstanceManager } from './instance/NodeInstanceManager';
import { NodeMetadataManager } from './metadata/NodeMetadataManager';
import { NodeInteractionManager } from './interaction/NodeInteractionManager';
import { NodeManagerInterface, NodeManagerError, NodeManagerErrorType } from './NodeManagerInterface';
import { NodeData } from '../../core/types';
import { XRHandWithHaptics } from '../../types/xr';
import { createLogger } from '../../core/logger';

const logger = createLogger('NodeManagerFacade');

/**
 * NodeManagerFacade provides a unified interface to the node management system.
 * It coordinates between the geometry, instance, metadata, and interaction managers.
 */
export class NodeManagerFacade implements NodeManagerInterface {
    private static instance: NodeManagerFacade;
    private camera: Camera;
    private geometryManager: NodeGeometryManager;
    private instanceManager: NodeInstanceManager;
    private metadataManager: NodeMetadataManager;
    private interactionManager: NodeInteractionManager;
    private isInitialized: boolean = false;

    private constructor(scene: Scene, camera: Camera, material: Material) {
        this.camera = camera;

        try {
            // Initialize managers in the correct order
            this.geometryManager = NodeGeometryManager.getInstance();
            this.instanceManager = NodeInstanceManager.getInstance(scene, material);
            this.metadataManager = NodeMetadataManager.getInstance();
            
            // Initialize interaction manager with instance mesh
            const instanceMesh = this.instanceManager.getInstanceMesh();
            this.interactionManager = NodeInteractionManager.getInstance(instanceMesh);

            this.isInitialized = true;
            logger.info('NodeManagerFacade initialized');
        } catch (error) {
            throw new NodeManagerError(
                NodeManagerErrorType.INITIALIZATION_FAILED,
                'Failed to initialize NodeManagerFacade',
                error
            );
        }
    }
    
    public static getInstance(scene: Scene, camera: Camera, material: Material): NodeManagerFacade {
        if (!NodeManagerFacade.instance) {
            NodeManagerFacade.instance = new NodeManagerFacade(scene, camera, material);
        }
        return NodeManagerFacade.instance;
    }

    public setXRMode(enabled: boolean): void {
        if (!this.isInitialized) return;

        try {
            const instanceMesh = this.instanceManager.getInstanceMesh();
            instanceMesh.layers.set(enabled ? 1 : 0);
            logger.debug(`XR mode ${enabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            throw new NodeManagerError(
                NodeManagerErrorType.XR_MODE_SWITCH_FAILED,
                'Failed to switch XR mode',
                error
            );
        }
    }

    public handleSettingsUpdate(_settings: any): void {
        if (!this.isInitialized) return;

        // Update settings in each manager as needed
        // This will be implemented based on what settings each manager needs
        logger.debug('Settings update not yet implemented');
    }

    /**
     * Update node positions and states
     * @param nodes Array of node updates
     */
    public updateNodes(nodes: { id: string, data: NodeData }[]): void {
        if (!this.isInitialized) return;

        // Update instance positions
        this.instanceManager.updateNodePositions(nodes.map(node => ({
            id: node.id,
            position: [
                node.data.position.x,
                node.data.position.y,
                node.data.position.z
            ],
            velocity: node.data.velocity ? [
                node.data.velocity.x,
                node.data.velocity.y,
                node.data.velocity.z
            ] : undefined
        })));

        // Update metadata for each node
        nodes.forEach(node => {
            if (node.data.metadata) {
                this.metadataManager.updateMetadata(node.id, {
                    id: node.id,
                    name: node.data.metadata.name || '',
                    position: node.data.position,
                    commitAge: 0,
                    hyperlinkCount: node.data.metadata.links?.length || 0,
                    importance: 0
                });
            }
        });
    }

    public updateNodePositions(nodes: { 
        id: string, 
        data: { 
            position: [number, number, number],
            velocity?: [number, number, number]
        } 
    }[]): void {
        if (!this.isInitialized) return;

        try {
            // Update instance positions
            this.instanceManager.updateNodePositions(nodes.map(node => ({
                id: node.id,
                position: node.data.position,
                velocity: node.data.velocity
            })));
        } catch (error) {
            throw new NodeManagerError(
                NodeManagerErrorType.UPDATE_FAILED,
                'Failed to update node positions',
                error
            );
        }
    }


    /**
     * Handle XR hand interactions
     * @param hand XR hand data with haptic feedback
     */
    public handleHandInteraction(hand: XRHandWithHaptics): void {
        if (!this.isInitialized) return;
        this.interactionManager.handleHandInteraction(hand);
    }

    /**
     * Update the visualization state
     * @param deltaTime Time since last update
     */
    public update(deltaTime: number): void {
        if (!this.isInitialized) return;

        // Update instance visibility and LOD
        this.instanceManager.update(this.camera, deltaTime);

        // Update metadata labels
        this.metadataManager.update(this.camera);
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (!this.isInitialized) return;

        try {
            this.geometryManager.dispose();
            this.instanceManager.dispose();
            this.metadataManager.dispose();
            this.interactionManager.dispose();

            NodeManagerFacade.instance = null!;
            this.isInitialized = false;
            logger.info('NodeManagerFacade disposed');
        } catch (error) {
            throw new NodeManagerError(
                NodeManagerErrorType.RESOURCE_CLEANUP_FAILED,
                'Failed to dispose NodeManagerFacade',
                error
            );
        }
        logger.info('NodeManagerFacade disposed');
    }

    /**
     * Get the underlying InstancedMesh
     * Useful for adding to scenes or handling special cases
     */
    public getInstancedMesh(): InstancedMesh {
        return this.instanceManager.getInstanceMesh();
    }

    /**
     * Get node ID from instance index
     * @param index Instance index in the InstancedMesh
     * @returns Node ID or undefined if not found
     */
    public getNodeId(index: number): string | undefined {
        return this.instanceManager.getNodeId(index);
    }

    /**
     * Get the underlying NodeInstanceManager
     * @returns The NodeInstanceManager instance
     */
    public getNodeInstanceManager(): NodeInstanceManager {
        return this.instanceManager;
    }
}