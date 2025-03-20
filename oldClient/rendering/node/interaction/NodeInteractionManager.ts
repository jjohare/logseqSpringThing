import {
    InstancedMesh,
    Vector3,
    Vector2,
    Matrix4,
    Raycaster,
    Camera,
} from 'three';
import { XRHandWithHaptics, HapticActuator } from '../../../types/xr';
import { NodeInstanceManager } from '../instance/NodeInstanceManager'; 
import { graphDataManager } from '../../../state/graphData';
import { createLogger, createErrorMetadata, createDataMetadata } from '../../../core/logger';
import { WebSocketService } from '../../../websocket/websocketService';
import { SceneManager } from '../../scene';

const logger = createLogger('NodeInteractionManager');

export class NodeInteractionManager {
    private static instance: NodeInteractionManager;
    private instanceMesh: InstancedMesh;
    private tempMatrix: Matrix4 = new Matrix4();
    private readonly interactionRadius: number = 0.1; // 10cm interaction radius
    private readonly HAPTIC_STRENGTH = 0.5; // 50% intensity
    private hapticActuators: HapticActuator[] | null = null;
    private webSocketService: WebSocketService;
    
    // Desktop mode properties
    private canvas: HTMLCanvasElement | null = null;
    private camera: Camera | null = null;
    private raycaster: Raycaster = new Raycaster();
    private mouse: Vector2 = new Vector2();
    private selectedNodeId: string | null = null;
    private isDragging: boolean = false;
    private dragPlaneNormal: Vector3 = new Vector3();
    private dragPlaneConstant: number = 0;
    private dragOffset: Vector3 = new Vector3();
    private lastUpdateTime: number = 0;
    private updateThrottleMs: number = 100; // throttle updates to 10fps
    private nodeInstanceManager: NodeInstanceManager | null = null;
    private sceneManager: SceneManager | null = null;
    
    private constructor(instanceMesh: InstancedMesh) {
        this.instanceMesh = instanceMesh;
        this.webSocketService = WebSocketService.getInstance();
        
        // Try to get the NodeInstanceManager - this may be initialized later
        try {
            // This might fail initially if dependencies aren't ready yet
            this.nodeInstanceManager = null;
        } catch(e) {
            logger.warn('NodeInstanceManager not available at construction time');
        }
    }

    public static getInstance(instanceMesh: InstancedMesh): NodeInteractionManager {
        if (!NodeInteractionManager.instance) {
            NodeInteractionManager.instance = new NodeInteractionManager(instanceMesh);
        }
        return NodeInteractionManager.instance;
    }
    
    /**
     * Set the node instance manager reference
     * This is needed because of initialization order issues
     */
    public setNodeInstanceManager(manager: NodeInstanceManager): void {
        this.nodeInstanceManager = manager;
        logger.info('NodeInstanceManager set');
    }

    /**
     * Initialize desktop mode interactions
     * @param canvas The canvas element for event binding
     * @param camera The camera for raycasting
     */
    public initializeDesktopInteraction(canvas: HTMLCanvasElement, camera: Camera): void {
        this.canvas = canvas;
        this.camera = camera;
        
        // Add event listeners for desktop interactions
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        canvas.addEventListener('click', this.handleClick.bind(this));
        canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // Get the SceneManager instance
        try {
            this.sceneManager = SceneManager.getInstance(canvas);
        } catch(e) {
            logger.warn('Failed to get SceneManager instance', createErrorMetadata(e));
        }
        
        logger.info('Desktop interaction initialized');
    }

    /**
     * Handle XR hand interaction
     * @param hand XR hand data with haptic feedback
     */
    public handleHandInteraction(hand: XRHandWithHaptics): void {
        if (!this.instanceMesh) return;

        // Store haptic feedback actuator for later use
        if (hand.hapticActuators && !this.hapticActuators) {
            this.hapticActuators = hand.hapticActuators;
        }

        // Get hand joint positions
        const indexTip = hand.hand.joints['index-finger-tip'];
        if (!indexTip) return;

        // Check for node intersection
        const intersectedIndex = this.getIntersectedNodeIndex(indexTip.position);
        if (intersectedIndex !== -1) {
            this.handleNodeHover(intersectedIndex);
        }
    }

    /**
     * Get the index of the node closest to the given position
     * @param position Position to check
     * @returns Instance index of the closest node, or -1 if none found
     */
    public getIntersectedNodeIndex(position: Vector3): number {
        if (!this.instanceMesh) return -1;

        let closestIndex = -1;
        let closestDistance = this.interactionRadius;

        // Check each instance
        for (let i = 0; i < this.instanceMesh.count; i++) {
            // Get instance matrix
            this.instanceMesh.getMatrixAt(i, this.tempMatrix);
            const instancePosition = new Vector3().setFromMatrixPosition(this.tempMatrix);

            // Check distance
            const distance = position.distanceTo(instancePosition);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = i;
            }
        }

        return closestIndex;
    }
    
    /**
     * Convert mouse event to normalized device coordinates
     * @param event Mouse event
     */
    private updateMouseCoordinates(event: MouseEvent): void {
        if (!this.canvas) return;

        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / this.canvas.clientWidth) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / this.canvas.clientHeight) * 2 + 1;
    }
    
    /**
     * Perform raycasting to detect nodes
     * @returns Intersection information or null if no intersection
     */
    private getIntersectedNodeFromRaycast(): { instanceIndex: number, point: Vector3 } | null {
        if (!this.camera || !this.instanceMesh) return null;

        // Set up raycaster with the current mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Perform raycasting against the instanced mesh
        const intersects = this.raycaster.intersectObject(this.instanceMesh);
        
        if (intersects.length > 0) {
            // Check if we have an instanced intersection
            const instanceId = (intersects[0] as any).instanceId;
            if (typeof instanceId === 'number') {
                return {
                    instanceIndex: instanceId,
                    point: intersects[0].point.clone()
                };
            }
        }
        
        return null;
    }

    /**
     * Handle mouse down event for node interaction
     * @param event Mouse event
     */
    private handleMouseDown(event: MouseEvent): void {
        if (!this.camera || !this.nodeInstanceManager) return;

        this.updateMouseCoordinates(event);
        
        const intersection = this.getIntersectedNodeFromRaycast();
        if (intersection) {
            const nodeId = this.nodeInstanceManager.getNodeId(intersection.instanceIndex);
            if (nodeId) {
                // Select the node
                this.selectNode(nodeId);
                
                // Start drag operation
                this.startDrag(nodeId, intersection.point);
                
                // Prevent default to avoid text selection during drag
                event.preventDefault();
            }
        } else {
            // Clicked on empty space, deselect current node
            this.deselectNode();
        }
    }

    /**
     * Handle mouse move event for dragging
     * @param event Mouse event
     */
    private handleMouseMove(event: MouseEvent): void {
        if (!this.camera || !this.isDragging || !this.selectedNodeId) return;

        this.updateMouseCoordinates(event);
        this.updateDrag();
    }

    /**
     * Handle mouse up event to end drag
     * @param event Mouse event
     */
    private handleMouseUp(_event: MouseEvent): void {
        if (this.isDragging && this.selectedNodeId) {
            this.endDrag();
        }
    }

    /**
     * Handle single click event for selection
     * @param event Mouse event
     */
    private handleClick(event: MouseEvent): void {
        // Only handle click if we're not ending a drag
        if (this.isDragging) return;

        this.updateMouseCoordinates(event);
        
        const intersection = this.getIntersectedNodeFromRaycast();
        if (intersection) {
            const nodeId = this.nodeInstanceManager?.getNodeId(intersection.instanceIndex);
            if (nodeId) {
                this.selectNode(nodeId);
            }
        } else {
            // Clicked on empty space, deselect current node
            this.deselectNode();
        }
    }

    /**
     * Handle double click event for link out
     * @param event Mouse event
     */
    private handleDoubleClick(event: MouseEvent): void {
        this.updateMouseCoordinates(event);
        
        const intersection = this.getIntersectedNodeFromRaycast();
        if (intersection) {
            const nodeId = this.nodeInstanceManager?.getNodeId(intersection.instanceIndex);
            if (nodeId) {
                this.linkOut(nodeId);
            }
        }
    }
    
    /**
     * Select a node and update its visual state
     * @param nodeId ID of the node to select
     */
    private selectNode(nodeId: string): void {
        if (this.selectedNodeId === nodeId) return;
        
        // Deselect previous node if any
        if (this.selectedNodeId) {
            this.setNodeSelectedState(this.selectedNodeId, false);
        }
        
        // Select the new node
        this.selectedNodeId = nodeId;
        this.setNodeSelectedState(nodeId, true);
        
        logger.info(`Selected node: ${nodeId}`);
    }

    /**
     * Deselect the current node
     */
    private deselectNode(): void {
        if (!this.selectedNodeId) return;
        
        this.setNodeSelectedState(this.selectedNodeId, false);
        this.selectedNodeId = null;
    }

    /**
     * Set the selection state of a node
     * @param nodeId ID of the node
     * @param selected Whether the node is selected
     */
    private setNodeSelectedState(nodeId: string, selected: boolean): void {
        if (!this.nodeInstanceManager) return;
        
        // Use the NodeInstanceManager's implementation
        this.nodeInstanceManager.setNodeSelectedState(nodeId, selected);
    }

    /**
     * Start dragging a node
     * @param nodeId ID of the node to drag
     * @param intersectionPoint Intersection point on the node
     */
    private startDrag(nodeId: string, intersectionPoint: Vector3): void {
        if (!this.camera || !this.nodeInstanceManager) return;

        this.isDragging = true;

        // Disable orbit controls while dragging to lock the viewpoint
        if (this.sceneManager) {
            const controls = this.sceneManager.getControls();
            controls.enabled = false;
            logger.info('Orbit controls disabled for dragging');
        }
        
        // Get the node's current position
        const nodePosition = this.getNodePosition(nodeId);
        if (!nodePosition) {
            this.isDragging = false;
            return;
        }
        
        // Set up a plane perpendicular to the camera for dragging
        const cameraMatrix = this.camera.matrixWorld.elements;
        const lookVector = new Vector3(-cameraMatrix[8], -cameraMatrix[9], -cameraMatrix[10]).normalize();
        
        // Store normal vector and plane constant
        this.dragPlaneNormal.copy(lookVector);
        this.dragPlaneConstant = this.dragPlaneNormal.dot(nodePosition);
        
        // Calculate offset between intersection point and node position
        this.dragOffset.copy(intersectionPoint).sub(nodePosition);
        
        logger.info(`Started dragging node ${nodeId}`);
    }
    
    /**
     * Calculate intersection with drag plane and update node position
     */
    private updateDrag(): void {
        if (!this.camera || !this.selectedNodeId || !this.isDragging) return;
        
        // Cast ray from camera through mouse into scene
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const ray = this.raycaster.ray;
        
        // Calculate intersection with drag plane
        // Using the formula: t = (planeConstant - dot(normal, rayOrigin)) / dot(normal, rayDirection)
        const denominator = this.dragPlaneNormal.dot(ray.direction);
        
        // Avoid division by zero
        if (Math.abs(denominator) > 0.0001) {
            const t = (this.dragPlaneConstant - this.dragPlaneNormal.dot(ray.origin)) / denominator;
            
            // Only use positive intersections (in front of the camera)
            if (t > 0) {
                // Calculate intersection point: origin + direction * t
                const intersection = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
                
                // Subtract the drag offset to get the new node position
                const newPosition = intersection.clone().sub(this.dragOffset);
                
                // Update node position with throttling to avoid overwhelming the server
                const now = performance.now();
                if (now - this.lastUpdateTime > this.updateThrottleMs) {
                    this.lastUpdateTime = now;
                    
                    // Update local node instance first
                    this.updateNodePosition(this.selectedNodeId, newPosition);
                    
                    // Then send update to server
                    this.sendNodeUpdates(this.selectedNodeId, newPosition);
                }
            }
        }
    }

    /**
     * End the drag operation
     */
    private endDrag(): void {
        if (!this.selectedNodeId || !this.isDragging) return;
        
        // Re-enable orbit controls after dragging
        if (this.sceneManager) {
            const controls = this.sceneManager.getControls();
            controls.enabled = true;
            logger.info('Orbit controls re-enabled after dragging');
        }
        
        // Get final position
        const finalPosition = this.getNodePosition(this.selectedNodeId);
        if (finalPosition) {
            // Send final update to server (not throttled)
            this.sendNodeUpdates(this.selectedNodeId, finalPosition);
        }
        
        this.isDragging = false;
        logger.info(`Ended dragging node ${this.selectedNodeId}`);
    }
    
    /**
     * Get a node's current position from the NodeInstanceManager
     */
    private getNodePosition(nodeId: string): Vector3 | undefined {
        if (!this.nodeInstanceManager) return undefined;
        return this.nodeInstanceManager.getNodePosition(nodeId);
    }
    
    /**
     * Update a node's position locally
     */
    private updateNodePosition(nodeId: string, position: Vector3): void {
        if (!this.nodeInstanceManager) return;
        // Update using the batch update API
        this.nodeInstanceManager.updateNodePositions([{
            id: nodeId,
            position,
            velocity: new Vector3(0, 0, 0)
        }]);
    }
    
    /**
     * "Link out" - open the node's document in a web browser
     */
    private linkOut(nodeId: string): void {
        // Get the node name (metadata ID)
        const node = graphDataManager.getNode(nodeId);
        const metadataId = graphDataManager.getNodeMetadataId(nodeId);
        
        // Find the best name to use for the URL
        let nodeName: string | undefined;
        if (node && node.data.metadata?.name) {
            nodeName = node.data.metadata.name;
        } else if (metadataId) {
            nodeName = metadataId;
        }
        
        if (nodeName) {
            // Format the node name for URL (remove .md extension, replace spaces with %20)
            const formattedName = nodeName.replace(/\.md$/, '').replace(/ /g, '%20');
            
            // Open in new tab
            window.open(`https://narrativegoldmine.com//#/page/${formattedName}`, '_blank');
            logger.info(`Linked out to node ${nodeId}: ${nodeName}`);
        } else {
            logger.warn(`Cannot link out: No name available for node ${nodeId}`);
        }
    }

    /**
     * Send node position updates to the server via WebSockets
     * @param nodeId The ID of the node being updated
     * @param position The new position for the node
     */
    public sendNodeUpdates(nodeId: string, position: Vector3): void {
        if (!nodeId) {
            logger.warn('Cannot send node update: Invalid node ID');
            return;
        }

        // Add debug logging to track node updates being sent for dragging operations
        logger.info('Sending node position update to server', createDataMetadata({
            nodeId,
            position: {
                x: parseFloat(position.x.toFixed(3)),
                y: parseFloat(position.y.toFixed(3)),
                z: parseFloat(position.z.toFixed(3))
            },
            operation: this.isDragging ? 'dragging' : 'end-drag',
            timestamp: Date.now()
        }));

        // Send the update to the WebSocket service
        this.webSocketService.sendNodeUpdates([{
            id: nodeId,
            position: position.clone(),
            velocity: new Vector3(0, 0, 0)
        }]);
    }

    private handleNodeHover(_instanceIndex: number): void {
        // Trigger haptic feedback if available
        if (this.hapticActuators?.[0]) {
            this.hapticActuators[0].pulse(this.HAPTIC_STRENGTH, 50).catch(logger.error);
        }
    }

    public dispose(): void {
        this.hapticActuators = null;
        
        // Clean up event listeners if they were added
        if (this.canvas) {
            // Create bound references to methods for proper removal
            const boundMouseDown = this.handleMouseDown.bind(this);
            const boundMouseUp = this.handleMouseUp.bind(this);
            const boundMouseMove = this.handleMouseMove.bind(this);
            const boundClick = this.handleClick.bind(this);
            const boundDoubleClick = this.handleDoubleClick.bind(this);
            
            this.canvas.removeEventListener('mousedown', boundMouseDown);
            this.canvas.removeEventListener('mouseup', boundMouseUp);
            this.canvas.removeEventListener('mousemove', boundMouseMove);
            this.canvas.removeEventListener('click', boundClick);
            this.canvas.removeEventListener('dblclick', boundDoubleClick);
            
            this.canvas = null;
        }
        
        this.nodeInstanceManager = null;
        NodeInteractionManager.instance = null!;
        logger.info('NodeInteractionManager disposed');
    }
}