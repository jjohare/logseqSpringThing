import { Vector3 } from 'three';
import { XRHandWithHaptics } from '../types/xr';
import { WebSocketService } from '../websocket/websocketService';
import { NodeManagerFacade } from '../rendering/node/NodeManagerFacade';
import { NodeInteractionManager } from '../rendering/node/interaction/NodeInteractionManager';
import { createLogger } from '../core/logger';

const _logger = createLogger('HandInteraction');

export class HandInteractionManager {
    private static instance: HandInteractionManager;
    private lastPinchState: boolean = false;
    private websocketService: WebSocketService;
    private nodeManager?: NodeManagerFacade;
    private interactionManager?: NodeInteractionManager;

    private constructor() {
        this.websocketService = WebSocketService.getInstance();
    }

    public static getInstance(): HandInteractionManager {
        if (!HandInteractionManager.instance) {
            HandInteractionManager.instance = new HandInteractionManager();
        }
        return HandInteractionManager.instance;
    }

    public setNodeManager(nodeManager: NodeManagerFacade): void {
        this.nodeManager = nodeManager;
        this.interactionManager = NodeInteractionManager.getInstance(nodeManager.getInstancedMesh());
    }

    public processHandInput(hand: XRHandWithHaptics): void {
        if (!this.nodeManager || !this.interactionManager) return;

        const thumbTip = hand.hand.joints['thumb-tip'];
        const indexTip = hand.hand.joints['index-finger-tip'];

        if (!thumbTip || !indexTip) return;

        const distance = thumbTip.position.distanceTo(indexTip.position);
        const pinchStrength = Math.max(0, 1 - distance / 0.05); // 5cm max distance
        hand.pinchStrength = pinchStrength;

        // Detect pinch gesture
        const isPinching = pinchStrength > 0.9; // 90% threshold for pinch
        if (isPinching !== this.lastPinchState) {
            this.lastPinchState = isPinching;
            if (isPinching) {
                this.handlePinchGesture(indexTip.position);
            }
        }

        // Pass hand data to interaction manager
        this.interactionManager.handleHandInteraction(hand);
    }

    private handlePinchGesture(position: Vector3): void {
        if (!this.nodeManager || !this.interactionManager) return;

        // Get the instance mesh
        const instanceMesh = this.nodeManager.getInstancedMesh();
        if (!instanceMesh) return;

        // Get the intersected node index
        const intersectedNodeIndex = this.interactionManager.getIntersectedNodeIndex(position);
        if (intersectedNodeIndex === -1) return;

        // Get node ID from instance index
        const nodeId = this.nodeManager.getNodeId(intersectedNodeIndex);
        if (!nodeId) return;

        _logger.debug(`Pinch gesture detected on node ${nodeId}`);
        
        // Send node position update through websocket
        this.websocketService.sendNodeUpdates([{
            id: nodeId,
            position: { x: position.x, y: position.y, z: position.z },
            velocity: { x: 0, y: 0, z: 0 }
        }]);

        // Update local node position
        this.nodeManager.updateNodePositions([{
            id: nodeId,
            data: { position: [position.x, position.y, position.z], velocity: [0, 0, 0] }
        }]);
    }

    public dispose(): void {
        this.lastPinchState = false;
        this.nodeManager = undefined;
        this.interactionManager = undefined;
    }
}