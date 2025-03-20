import { Vector3 } from 'three';
import { XRHandWithHaptics } from '../types/xr';
import { NodeManagerFacade } from '../rendering/node/NodeManagerFacade';
import { NodeInteractionManager } from '../rendering/node/interaction/NodeInteractionManager';
import { createLogger } from '../core/logger';
import { SettingsStore } from '../state/SettingsStore';
import { platformManager } from '../platform/platformManager';

const logger = createLogger('HandInteraction');

export class HandInteractionManager {
    private static instance: HandInteractionManager;
    private lastPinchState: boolean = false;
    private settingsStore: SettingsStore;
    private nodeManager?: NodeManagerFacade;
    private interactionManager?: NodeInteractionManager;
    private isInitialized: boolean = false;
    private initializationTime: number = 0;
    private readonly INITIALIZATION_DELAY_MS = 3000; // 3 second delay before enabling interactions
    private sessionStateListener: ((state: string) => void) | null = null;

    private constructor() {
        this.settingsStore = SettingsStore.getInstance();
        this.initializationTime = Date.now();
        this.setupSessionStateListener();
    }

    public static getInstance(): HandInteractionManager {
        if (!HandInteractionManager.instance) {
            HandInteractionManager.instance = new HandInteractionManager();
        }
        return HandInteractionManager.instance;
    }

    private setupSessionStateListener(): void {
        // Listen for session state changes to reset interaction state
        this.sessionStateListener = (state: string) => {
            if (state === 'starting') {
                // Reset initialization time when starting a new session
                this.initializationTime = Date.now();
                this.isInitialized = false;
            }
        };
        platformManager.on('xrsessionstatechange', this.sessionStateListener);
    }

    public setNodeManager(nodeManager: NodeManagerFacade): void {
        this.nodeManager = nodeManager;
        this.interactionManager = NodeInteractionManager.getInstance(nodeManager.getInstancedMesh());
        
        // Mark as initialized but still respect the delay
        setTimeout(() => {
            this.isInitialized = true;
            logger.info(`Hand interaction enabled after ${this.INITIALIZATION_DELAY_MS}ms delay`);
        }, this.INITIALIZATION_DELAY_MS);
    }

    public processHandInput(hand: XRHandWithHaptics): void {
        // Don't process input during initialization period
        if (!this.isInitialized || !this.nodeManager || !this.interactionManager) {
            return;
        }
        
        // Check if enough time has passed since initialization
        const timeSinceInit = Date.now() - this.initializationTime;
        if (timeSinceInit < this.INITIALIZATION_DELAY_MS) {
            return;
        }

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

        logger.debug(`Pinch gesture detected on node ${nodeId}`);
        
        // Check if we're still in the initialization phase
        if (!this.settingsStore.isInitialized()) {
            logger.warn('Ignoring node interaction - settings not fully initialized');
            return;
        }
        
        // Send node position update through the interaction manager
        this.interactionManager.sendNodeUpdates(nodeId, position);

        // Update local node position
        this.nodeManager.updateNodePositions([{
            id: nodeId,
            data: { position: position.clone(), velocity: new Vector3(0, 0, 0) }
        }]);
    }

    public dispose(): void {
        this.lastPinchState = false;
        this.nodeManager = undefined;
        this.isInitialized = false;
        this.interactionManager = undefined;
        
        // Remove session state listener
        if (this.sessionStateListener) {
            platformManager.removeAllListeners();
        }
    }
}