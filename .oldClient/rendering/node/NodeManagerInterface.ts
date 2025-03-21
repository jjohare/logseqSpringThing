import { XRHandWithHaptics } from '../../types/xr';
import { NodeData } from '../../core/types';
import { Camera, Scene, Vector3 } from 'three';

/**
 * Common interface for node management implementations.
 * This ensures compatibility between the old EnhancedNodeManager
 * and the new NodeManagerFacade during migration.
 */
export interface NodeManagerInterface {
    /**
     * Update node positions and metadata
     * @param nodes Array of node updates containing position and metadata
     */
    updateNodes(nodes: { id: string, data: NodeData }[]): void;

    /**
     * Update node positions from binary data
     * @param nodes Array of node position updates
     */
    updateNodePositions(nodes: { 
        id: string, 
        data: { 
            position: Vector3,
            velocity?: Vector3
        } 
    }[]): void;

    /**
     * Handle XR hand interactions
     * @param hand XR hand data with haptic feedback capabilities
     */
    handleHandInteraction(hand: XRHandWithHaptics): void;

    /**
     * Update the visualization state
     * @param deltaTime Time since last update in seconds
     */
    update(deltaTime: number): void;

    /**
     * Clean up resources
     */
    dispose(): void;

    /**
     * Set XR mode state
     * @param enabled Whether XR mode is active
     */
    setXRMode(enabled: boolean): void;

    /**
     * Handle settings updates
     * @param settings Updated settings object
     */
    handleSettingsUpdate(settings: any): void;
}

/**
 * Factory interface for creating node managers
 */
export interface NodeManagerFactory {
    /**
     * Create a node manager instance
     * @param scene Three.js scene
     * @param camera Camera for visibility calculations
     * @param settings Application settings
     */
    createNodeManager(scene: Scene, camera: Camera, settings: any): NodeManagerInterface;
}

/**
 * Configuration options for node managers
 */
export interface NodeManagerConfig {
    /**
     * Maximum number of nodes to support
     */
    maxNodes?: number;

    /**
     * Distance threshold for LOD transitions
     */
    lodThresholds?: {
        high: number;
        medium: number;
        low: number;
    };

    /**
     * Performance settings
     */
    performance?: {
        batchSize?: number;
        updateInterval?: number;
        cullingDistance?: number;
    };

    /**
     * Metadata visualization settings
     */
    metadata?: {
        enabled?: boolean;
        maxDistance?: number;
        updateInterval?: number;
    };
}

/**
 * Error types specific to node management
 */
export enum NodeManagerErrorType {
    INITIALIZATION_FAILED = 'initialization_failed',
    UPDATE_FAILED = 'update_failed',
    RESOURCE_CLEANUP_FAILED = 'resource_cleanup_failed',
    INVALID_NODE_DATA = 'invalid_node_data',
    XR_MODE_SWITCH_FAILED = 'xr_mode_switch_failed'
}

/**
 * Custom error class for node management errors
 */
export class NodeManagerError extends Error {
    constructor(
        public type: NodeManagerErrorType,
        message: string,
        public details?: any
    ) {
        super(message);
        this.name = 'NodeManagerError';
    }
}