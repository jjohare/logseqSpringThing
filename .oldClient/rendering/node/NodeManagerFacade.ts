import {
    Scene,
    Camera,
    Material,
    InstancedMesh,
    Vector3
} from 'three';
import { NodeGeometryManager } from './geometry/NodeGeometryManager';
import { NodeInstanceManager } from './instance/NodeInstanceManager'; 
import { NodeMetadataManager } from './metadata/NodeMetadataManager';
import { NodeInteractionManager } from './interaction/NodeInteractionManager'; 
import { NodeManagerInterface, NodeManagerError, NodeManagerErrorType } from './NodeManagerInterface'; 
import { NodeIdentityManager } from './identity/NodeIdentityManager';
import { NodeData } from '../../core/types';
import { XRHandWithHaptics } from '../../types/xr';
import { debugState } from '../../core/debugState';
import { createLogger, createDataMetadata, createErrorMetadata } from '../../core/logger';
import { UpdateThrottler } from '../../core/utils';
import { Settings } from '../../types/settings';

const logger = createLogger('NodeManagerFacade');

// Constants for size calculation
const DEFAULT_FILE_SIZE = 1000; // 1KB default
const MAX_FILE_SIZE = 10485760; // 10MB max for scaling
const MIN_NODE_SIZE = 0;
const MAX_NODE_SIZE = 50;

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
    private identityManager: NodeIdentityManager;
    private settings: Settings;
    private isInitialized: boolean = false;
    private frameCount: number = 0;
    private tempVector = new Vector3();
    private labelsInitialized: boolean = false;
    private metadataUpdateThrottler = new UpdateThrottler(100); // Update at most every 100ms
    private readonly MAX_POSITION = 1000.0; // Reasonable limit for safe positions

    private constructor(scene: Scene, camera: Camera, material: Material) {
        this.camera = camera;
        this.settings = {} as Settings; // Initialize with empty settings
        
        logger.info('NodeManagerFacade constructor called', createDataMetadata({
            timestamp: Date.now(),
            cameraPosition: camera?.position ? 
                {x: camera.position.x, y: camera.position.y, z: camera.position.z} : 
                'undefined'
        }));

        // Get the identity manager instance first
        this.identityManager = NodeIdentityManager.getInstance();

        try {
            logger.info('INITIALIZATION ORDER: NodeManagerFacade - Step 1: Creating NodeGeometryManager');
            // Initialize managers in the correct order
            this.geometryManager = NodeGeometryManager.getInstance();
            
            logger.info('INITIALIZATION ORDER: NodeManagerFacade - Step 2: Creating NodeInstanceManager');
            this.instanceManager = NodeInstanceManager.getInstance(scene, material);
            
            logger.info('INITIALIZATION ORDER: NodeManagerFacade - Step 3: Creating NodeMetadataManager');
            this.metadataManager = NodeMetadataManager.getInstance(scene, this.settings);
            
            // Initialize interaction manager with instance mesh
            logger.info('INITIALIZATION ORDER: NodeManagerFacade - Step 4: Creating NodeInteractionManager');
            const instanceMesh = this.instanceManager.getInstanceMesh();
            this.interactionManager = NodeInteractionManager.getInstance(instanceMesh);

            this.isInitialized = true;
            logger.info('NodeManagerFacade initialized');
        } catch (error) {
            logger.error('Failed to initialize NodeManagerFacade:', createErrorMetadata(error));
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

    private calculateNodeSize(fileSize: number = DEFAULT_FILE_SIZE): number {
        // Map file size logarithmically to 0-1 range
        const normalizedSize = Math.log(Math.min(fileSize, MAX_FILE_SIZE)) / Math.log(MAX_FILE_SIZE);
        // Map to metadata node size range (0-50)
        return MIN_NODE_SIZE + normalizedSize * (MAX_NODE_SIZE - MIN_NODE_SIZE);
    }

    /**
     * Validates that a node ID is a numeric string
     * This ensures we're using the correct server-generated IDs
     * @param nodeId The node ID to validate
     * @returns True if the ID is valid (numeric string), false otherwise
     */
    private validateNodeId(nodeId: string): boolean {
        // Ensure boolean return and handle null/undefined
        return !!nodeId && this.identityManager.isValidNumericId(nodeId);
    }

    public setXRMode(enabled: boolean): void {
        if (!this.isInitialized) return;

        try {
            const instanceMesh = this.instanceManager.getInstanceMesh();
            if (enabled) {
                // In XR mode, only use layer 1
                instanceMesh.layers.set(1);
            } else {
                // In non-XR mode, make sure both layers are enabled for consistent visibility
                instanceMesh.layers.enable(0);
                instanceMesh.layers.enable(1);
            }
            this.metadataManager.setXRMode(enabled);
            logger.debug('XR mode status changed', createDataMetadata({ enabled }));
        } catch (error) {
            throw new NodeManagerError(
                NodeManagerErrorType.XR_MODE_SWITCH_FAILED,
                'Failed to switch XR mode',
                error
            );
        }
    }

    public handleSettingsUpdate(settings: Settings): void {
        if (!this.isInitialized) return;

        try {
            this.settings = settings; // Store the settings
            // Update metadata visibility threshold if needed
            if (settings.visualization?.labels?.visibilityThreshold) {
                this.metadataManager.updateVisibilityThreshold(
                    settings.visualization.labels.visibilityThreshold
                );
            }
            
            // Pass settings to the metadata manager
            this.metadataManager.handleSettingsUpdate(settings);
        } catch (error) {
            logger.error('Failed to update settings:', createErrorMetadata(error));
        }
    }

    /**
     * Update node positions and states
     * @param nodes Array of node updates
     */
    public updateNodes(nodes: { id: string, data: NodeData }[]): void {
        const updateStartTime = performance.now();

        if (!this.isInitialized) return;

        // On the first update, reset the node identity manager to ensure clean state
        if (!this.labelsInitialized) {
            this.identityManager.reset();
            logger.info('First updateNodes call: Reset identity manager to ensure clean state');
            this.labelsInitialized = true;
        }

        logger.info(`Updating ${nodes.length} nodes in NodeManagerFacade`, createDataMetadata({
            timestamp: Date.now(),
            nodeCount: nodes.length,
            firstNodeId: nodes.length > 0 ? nodes[0].id : 'none',
            hasInstanceManager: !!this.instanceManager,
            hasMetadataManager: !!this.metadataManager,
        }));

        const shouldDebugLog = debugState.isEnabled() && debugState.isNodeDebugEnabled();
        
        // First, log detailed info about the first few nodes to help with debugging
        if (shouldDebugLog && nodes.length > 0) {
            const sampleNodes = nodes.slice(0, Math.min(3, nodes.length));
            logger.debug('Node sample for debugging:', createDataMetadata({
                nodes: sampleNodes.map(node => ({
                    id: node.id,
                    hasMetadata: !!node.data.metadata,
                    metadataName: node.data.metadata?.name || 'undefined',
                    metadataFileName: node.data.metadata?.file_name || 'undefined'
                }))
            }));
        }
        
        this.frameCount++;

        // Filter out any nodes with invalid IDs before processing
        const validNodes = nodes.filter(node => {
            if (!this.validateNodeId(node.id)) {
                logger.warn(`Skipping node with invalid ID format: ${node.id}. Node IDs must be numeric strings.`);
                return false;
            }
            return true;
        });

        if (validNodes.length < nodes.length) {
            logger.warn(`Filtered out ${nodes.length - validNodes.length} nodes with invalid IDs`);
        }
 
        // Create a more detailed processing structure for each node
        // Process nodes with explicit label handling before identity management
        const enhancedNodes = validNodes.map(node => {
            // Extract all possible label sources 
            const metadataName = node.data.metadata?.name;
            const metadataFileName = node.data.metadata?.file_name;
            const isMetadataNameValid = metadataName && 
                typeof metadataName === 'string' && 
                metadataName !== 'undefined' &&
                metadataName !== 'null' &&
                metadataName !== node.id;
                                       
            // Force a unique name if needed by explicitly calling forceNodeLabel
            // This ensures we always have a valid display name
            let displayName;
            
            if (isMetadataNameValid) {
                // First choice: Use metadata name (e.g., file title without extension)
                displayName = metadataName;
            } else if (metadataFileName && 
                      typeof metadataFileName === 'string' && 
                      metadataFileName !== 'undefined' &&
                      metadataFileName !== 'null') {
                // Second choice: Use file name if available
                displayName = metadataFileName;
            } else {
                // Last resort: Use node ID with prefix
                displayName = `Node_${node.id}`;
            }
                              
            // If we have a good name that isn't just the ID, force it
            if (displayName && displayName !== node.id) {
                this.identityManager.forceNodeLabel(node.id, displayName);
                if (shouldDebugLog) {
                    // Only log occasionally to reduce spam
                    if (Math.random() < 0.1) {
                        logger.debug(`Label for node ${node.id}: "${displayName}"`);
                    }
                }
            }
            
            return node;
        });

        // Process enhanced nodes through identity manager to detect duplicates
        const { duplicateLabels } = this.identityManager.processNodes(enhancedNodes);
        
        // Log duplicate labels
        if (duplicateLabels.size > 0) {
            logger.warn(`Found ${duplicateLabels.size} duplicate labels`, createDataMetadata({
                duplicateLabelsCount: duplicateLabels.size,
                duplicateLabels: Array.from(duplicateLabels.entries()).map(([label, ids]) => 
                    `${label}: ${ids.join(', ')}`)
            }));
        }
        
        // Prepare metadata mappings for the metadata manager
        const metadataMappings = validNodes.map(node => {
            // Get the label for this node (prioritizing metadata name if possible)
            const bestLabel = this.identityManager.getLabel(node.id);
            
            // Use the metadata name if available, otherwise use our best label
            const displayName = node.data.metadata?.name && 
                               typeof node.data.metadata.name === 'string' && 
                               node.data.metadata.name !== 'undefined' &&
                               node.data.metadata.name !== 'null' ? 
                                  node.data.metadata.name : bestLabel;
            
            return {
                id: node.id,
                metadataId: node.data.metadata?.name || displayName,
                label: bestLabel
            };
        });
        
        this.metadataManager.initializeMappings(metadataMappings);
        
        // Process nodes for visualization
        const processedIds = new Set<string>();
        validNodes.forEach((node, index) => {
            if (shouldDebugLog && index < 3) {
                // Get the best label from our identity manager
                const bestLabel = this.identityManager.getLabel(node.id);
                logger.debug(`Processing node ${index}: id=${node.id}, label=${bestLabel}`, 
                    createDataMetadata({
                        hasMetadata: !!node.data.metadata,
                        fileSize: node.data.metadata?.fileSize
                    }));
            }
            
            // Skip any duplicate node IDs in this batch
            if (processedIds.has(node.id)) {
                logger.debug(`Skipping duplicate node ID: ${node.id}`);
                return;
            }
            processedIds.add(node.id);
            
            if (node.data.metadata) {
                // Log position information to help diagnose issues
                if (node.data.position && 
                    (node.data.position.x === 0 && node.data.position.y === 0 && node.data.position.z === 0)) {
                    logger.warn(`Node ${node.id} has ZERO position during updateNodes`, createDataMetadata({
                        label: this.identityManager.getLabel(node.id) || node.id,
                        position: `x:0, y:0, z:0`
                    }));
                } else if (node.data.position) {
                    if (shouldDebugLog && index < 5) {
                        logger.debug(`Node ${node.id} position: x:${node.data.position.x.toFixed(2)}, ` +
                                     `y:${node.data.position.y.toFixed(2)}, z:${node.data.position.z.toFixed(2)}`);
                    }
                } else {
                    logger.warn(`Node ${node.id} has NO position during updateNodes`);
                }
            }
        });

        // Update instance positions
        // Important: Use fresh map to avoid modifying the original nodes
        const nodePositionUpdates = validNodes.map(node => ({
            // Extract just what's needed for position update
            id: node.id,
            metadata: node.data.metadata || {},
            position: node.data.position,
            velocity: node.data.velocity
        }));
        this.instanceManager.updateNodePositions(nodePositionUpdates);
       
        // Only update metadata if the throttler allows it
        if (this.metadataUpdateThrottler.shouldUpdate()) {
            // Update metadata for each node
            validNodes.forEach(node => {
                if (node.data.metadata) {
                    // Ensure we have valid file size
                    const fileSize = node.data.metadata.fileSize && node.data.metadata.fileSize > 0 
                        ? node.data.metadata.fileSize 
                        : DEFAULT_FILE_SIZE;
                    
                    // Get the best label from our identity manager
                    const displayName = this.identityManager.getLabel(node.id);
                    
                    if (shouldDebugLog) {
                        logger.debug('Updating node metadata', createDataMetadata({ 
                            nodeId: node.id, 
                            displayName,
                            fileSize: node.data.metadata.fileSize
                        }));
                    }
                    
                    this.metadataManager.updateMetadata(node.id, {
                        id: node.id,
                        name: displayName, // Use the best name available
                        position: node.data.position,
                        // Ensure proper metadata is set with appropriate defaults
                        commitAge: node.data.metadata.lastModified !== undefined 
                            ? node.data.metadata.lastModified 
                            : 0,
                        hyperlinkCount: (node.data.metadata.hyperlinkCount !== undefined && node.data.metadata.hyperlinkCount > 0)
                            ? node.data.metadata.hyperlinkCount
                            : node.data.metadata.links?.length || 0,
                        importance: node.data.metadata.hyperlinkCount || 0,
                        fileSize: fileSize, // Use the provided fileSize
                        nodeSize: this.calculateNodeSize(fileSize),
                    });
                }
            });
        }

        const updateElapsedTime = performance.now() - updateStartTime;
        logger.info(`Node updates completed in ${updateElapsedTime.toFixed(2)}ms`, createDataMetadata({
            nodeCount: nodes.length,
            validNodeCount: validNodes.length,
            processedCount: processedIds.size,
            elapsedTimeMs: updateElapsedTime.toFixed(2)
        }));
    }
 
    /**
     * Validates and fixes a Vector3 if it contains NaN or infinite values
     * Returns true if the vector was valid, false if it needed correction
     */
    private validateAndFixVector3(vec: Vector3, label: string, nodeId: string): boolean {
        const isValid = !isNaN(vec.x) && !isNaN(vec.y) && !isNaN(vec.z) &&
                       isFinite(vec.x) && isFinite(vec.y) && isFinite(vec.z);
        
        if (!isValid) {
            // Log warning with details of the invalid values
            logger.warn(`Invalid ${label} values for node ${nodeId}`, createDataMetadata({
                x: vec.x,
                y: vec.y,
                z: vec.z,
                isNaNX: isNaN(vec.x),
                isNaNY: isNaN(vec.y),
                isNaNZ: isNaN(vec.z),
                isFiniteX: isFinite(vec.x),
                isFiniteY: isFinite(vec.y),
                isFiniteZ: isFinite(vec.z)
            }));
            
            // Fix the vector - replace NaN or infinite values with 0
            vec.x = isNaN(vec.x) || !isFinite(vec.x) ? 0 : vec.x;
            vec.y = isNaN(vec.y) || !isFinite(vec.y) ? 0 : vec.y;
            vec.z = isNaN(vec.z) || !isFinite(vec.z) ? 0 : vec.z;
            
            // Also clamp to reasonable bounds
            vec.x = Math.max(-this.MAX_POSITION, Math.min(this.MAX_POSITION, vec.x));
            vec.y = Math.max(-this.MAX_POSITION, Math.min(this.MAX_POSITION, vec.y));
            vec.z = Math.max(-this.MAX_POSITION, Math.min(this.MAX_POSITION, vec.z));
        }
        return isValid;
    }

    public updateNodePositions(nodes: { 
        id: string, 
        data: { 
            position: Vector3,
            velocity?: Vector3
        } 
    }[]): void {
        if (!this.isInitialized) return;
        

        const updatePosStartTime = performance.now();
        let processedCount = 0;
        let skippedCount = 0;
        logger.info(`Updating positions for ${nodes.length} nodes`, createDataMetadata({
            timestamp: Date.now(),
            nodeCount: nodes.length
        }));

        try {
            // Process only nodes with valid IDs and proper positions
            const validatedNodes = nodes
              .filter(node => {
                if (!this.validateNodeId(node.id)) {
                    logger.warn(`Skipping node with invalid ID: ${node.id}`);
                    skippedCount++;
                    return false;
                }
                return true;
              })
              .map(node => {
                const position = node.data.position.clone();
                const velocity = node.data.velocity ? node.data.velocity.clone() : new Vector3();
                
                // Validate and fix vectors if needed
                const positionValid = this.validateAndFixVector3(position, 'position', node.id);
                const velocityValid = this.validateAndFixVector3(velocity, 'velocity', node.id);
                
                if (!positionValid || !velocityValid) {
                    logger.warn(`Fixed invalid vectors for node ${node.id}`, createDataMetadata({
                        positionValid,
                        velocityValid,
                        position: { x: position.x, y: position.y, z: position.z },
                        velocity: { x: velocity.x, y: velocity.y, z: velocity.z }
                    }));
                }
                
                processedCount++;
                return { 
                    id: node.id, 
                    position: position, 
                    velocity: velocity 
                };
            });
            
            this.instanceManager.updateNodePositions(validatedNodes);
            
            const updatePosElapsedTime = performance.now() - updatePosStartTime;
            logger.info(`Position updates completed in ${updatePosElapsedTime.toFixed(2)}ms`, createDataMetadata({
                nodeCount: nodes.length,
                processedCount,
                skippedCount,
                elapsedTimeMs: updatePosElapsedTime.toFixed(2)
            }));
        } catch (error) {
            logger.error('Position update failed:', createErrorMetadata(error));
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

        const updateFrameStartTime = performance.now();

        // Update instance visibility and LOD
        this.instanceManager.update(this.camera, deltaTime);
        
        // Log position updates only occasionally
        const shouldLogDetail = this.frameCount % 300 === 0; // Log every 300 frames
        let noPositionCount = 0;
        let zeroPositionCount = 0;

        // Update metadata positions to match instances
        try {
            // Only update positions every few frames for performance
            // Use a simple array of node IDs that we maintain in this class
            // This avoids dependencies on internal implementation details
            const nodeIds = this.identityManager.getAllNodeIds();
            const nodeCount = nodeIds.length;
            
            // Process each node ID
            let processedCount = 0;
            
            nodeIds.forEach(id => {
                if (!this.validateNodeId(id)) {
                    return; // Skip invalid IDs silently during routine updates
                }

                const position = this.instanceManager.getNodePosition(id);
                if (!position) {
                    noPositionCount++;
                    return;
                }
                
                // Check for zero positions
                if (position.x === 0 && position.y === 0 && position.z === 0) {
                    zeroPositionCount++;
                    if (shouldLogDetail && Math.random() < 0.2) {
                        logger.warn(`Node ${id} has ZERO position during metadata position update`);
                    }
                }
                
                this.tempVector.copy(position);
                
                // Calculate dynamic offset based on node size
                // Use the node's calculated size for offset
                const nodeSize = this.calculateNodeSize();
                
                this.tempVector.y += nodeSize * 0.03; // Drastically reduced offset for much closer label positioning
                // Update individual label position (preserve existing text content)
                this.metadataManager.updatePosition(id, this.tempVector.clone());
                processedCount++;
            });
            this.frameCount++;
            
            if (shouldLogDetail) {
                const updateFrameElapsedTime = performance.now() - updateFrameStartTime;
                logger.info(`Metadata position update frame ${this.frameCount}`, createDataMetadata({
                    totalNodes: nodeCount,
                    nodesWithoutPosition: noPositionCount,
                    processedNodes: processedCount,
                    elapsedTimeMs: updateFrameElapsedTime.toFixed(2)
                }));
            }
        } catch (error) {
            logger.error('Error updating metadata positions:', createErrorMetadata(error));
        }

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
            
            // Dispose the identity manager
            this.identityManager.dispose();

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
     * Get instance index from node ID
     * @param nodeId Numeric node ID
     * @returns Instance index or undefined if not found
     */
    public getInstanceIndex(nodeId: string): number | undefined {
        return this.instanceManager.getInstanceId(nodeId);
    }

    /**
     * Get the underlying NodeInstanceManager
     * @returns The NodeInstanceManager instance
     */
    public getNodeInstanceManager(): NodeInstanceManager {
        return this.instanceManager;
    }

    /**
     * Get the metadata ID for a given node ID
     * This is useful for retrieving the human-readable name (file name)
     * @param nodeId Node ID to look up
     * @returns Metadata ID (filename) or undefined if not found
     */
    public getMetadataId(nodeId: string): string | undefined {
        return this.identityManager.getLabel(nodeId);
    }
}