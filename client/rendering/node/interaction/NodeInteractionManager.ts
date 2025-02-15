import {
    InstancedMesh,
    Vector3,
    Matrix4,
} from 'three';
import { XRHandWithHaptics, HapticActuator } from '../../../types/xr';
import { createLogger } from '../../../core/logger';

const logger = createLogger('NodeInteractionManager');

export class NodeInteractionManager {
    private static instance: NodeInteractionManager;
    private instanceMesh: InstancedMesh;
    private tempMatrix: Matrix4 = new Matrix4();
    private readonly interactionRadius: number = 0.1; // 10cm interaction radius
    private readonly HAPTIC_STRENGTH = 0.5; // 50% intensity
    private hapticActuators: HapticActuator[] | null = null;
    
    private constructor(instanceMesh: InstancedMesh) {
        this.instanceMesh = instanceMesh;
    }

    public static getInstance(instanceMesh: InstancedMesh): NodeInteractionManager {
        if (!NodeInteractionManager.instance) {
            NodeInteractionManager.instance = new NodeInteractionManager(instanceMesh);
        }
        return NodeInteractionManager.instance;
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

    private handleNodeHover(_instanceIndex: number): void {
        // Trigger haptic feedback if available
        if (this.hapticActuators?.[0]) {
            this.hapticActuators[0].pulse(this.HAPTIC_STRENGTH, 50).catch(logger.error);
        }
    }

    public dispose(): void {
        this.hapticActuators = null;
        NodeInteractionManager.instance = null!;
        logger.info('NodeInteractionManager disposed');
    }
}