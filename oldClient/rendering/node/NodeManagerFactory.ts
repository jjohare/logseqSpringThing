import { Scene, Camera, Material } from 'three';
import { NodeManagerInterface, NodeManagerError, NodeManagerErrorType } from './NodeManagerInterface';
import { NodeManagerFacade } from './NodeManagerFacade';
import { createLogger } from '../../core/logger';

const logger = createLogger('NodeManagerFactory');

/**
 * Factory class for creating node manager instances.
 */
export class NodeManagerFactory {
    private static instance: NodeManagerFactory;
    private currentManager: NodeManagerInterface | null = null;

    private constructor() {}

    public static getInstance(): NodeManagerFactory {
        if (!NodeManagerFactory.instance) {
            NodeManagerFactory.instance = new NodeManagerFactory();
        }
        return NodeManagerFactory.instance;
    }

    /**
     * Create a node manager instance
     */
    public createNodeManager(
        scene: Scene,
        camera: Camera,
        material: Material,
        _settings: any
    ): NodeManagerInterface {
        try {
            // Clean up existing manager if any
            if (this.currentManager) {
                this.currentManager.dispose();
                this.currentManager = null;
            }

            logger.info('Creating node manager');
            this.currentManager = NodeManagerFacade.getInstance(
                scene,
                camera,
                material
            );
            logger.debug('Node manager created successfully');

            return this.currentManager;
        } catch (error) {
            throw new NodeManagerError(
                NodeManagerErrorType.INITIALIZATION_FAILED,
                'Failed to create node manager',
                error
            );
        }
    }

    /**
     * Get current node manager instance
     */
    public getCurrentManager(): NodeManagerInterface | null {
        return this.currentManager;
    }

    /**
     * Clean up resources
     */
    public dispose(): void {
        if (this.currentManager) {
            this.currentManager.dispose();
            this.currentManager = null;
        }
        NodeManagerFactory.instance = null!;
        logger.info('NodeManagerFactory disposed');
    }
}

// Export singleton instance
export const nodeManagerFactory = NodeManagerFactory.getInstance();