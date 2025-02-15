import { XRSessionManager } from './xrSessionManager';
import { SettingsStore } from '../state/SettingsStore';
import { createLogger } from '../core/logger';
import { WebSocketService } from '../websocket/websocketService';
import { XRSettings } from '../types/settings/xr';
import * as THREE from 'three';

const logger = createLogger('XRInteraction');

export class XRInteraction {
    private static instance: XRInteraction | null = null;
    private readonly settingsStore: SettingsStore;
    private updateBatch: Map<string, THREE.Vector3> = new Map();
    private batchUpdateTimeout: number | null = null;
    private settingsUnsubscribers: Array<() => void> = [];
    private interactionEnabled: boolean = false;
    private websocketService: WebSocketService;

    private xrManager: XRSessionManager;
    private constructor(xrManager: XRSessionManager) {
        this.xrManager = xrManager;
        this.settingsStore = SettingsStore.getInstance();
        this.websocketService = WebSocketService.getInstance();
        this.initializeSettings();
        this.initializeXRSession();
    }

    private async initializeXRSession(): Promise<void> {
        try {
            const { platformManager } = require('../platform/platformManager');
            const settings = this.settingsStore.get('xr') as XRSettings;
            
            // Auto-enter AR for Quest devices if enabled in settings
            if (platformManager.isQuest() && settings && settings.autoEnterAR) {
                logger.info('Auto-entering AR mode for Quest device');
                await this.xrManager.initXRSession();
            }
        } catch (error) {
            logger.error('Failed to initialize XR session:', error);
        }
    }

    private initializeSettings(): void {
        try {
            this.setupSettingsSubscription();
        } catch (error) {
            logger.error('Failed to setup settings subscription:', error);
        }
    }

    public static getInstance(xrManager: XRSessionManager): XRInteraction {
        if (!XRInteraction.instance) {
            XRInteraction.instance = new XRInteraction(xrManager);
        }
        return XRInteraction.instance;
    }

    private setupSettingsSubscription(): void {
        // Clear any existing subscriptions
        this.settingsUnsubscribers.forEach(unsub => unsub());
        this.settingsUnsubscribers = [];

        // Subscribe to XR interaction enabled state
        let unsubscriber: (() => void) | undefined;
        this.settingsStore.subscribe('xr.interaction.enabled', (value) => {
            this.interactionEnabled = typeof value === 'boolean' ? value : value === 'true';
            if (!this.interactionEnabled) {
                this.clearHandState();
            }
        }).then(unsub => {
            unsubscriber = unsub;
            if (unsubscriber) {
                this.settingsUnsubscribers.push(unsubscriber);
            }
        });
    }

    private clearHandState(): void {
        this.updateBatch.clear();
        if (this.batchUpdateTimeout) {
            clearTimeout(this.batchUpdateTimeout);
            this.batchUpdateTimeout = null;
        }
    }

    private scheduleFlush(): void {
        if (this.batchUpdateTimeout !== null) return;
        
        this.batchUpdateTimeout = requestAnimationFrame(() => {
            this.flushPositionUpdates();
            this.batchUpdateTimeout = null;
        });
    }

    private flushPositionUpdates(): void {
        if (this.updateBatch.size === 0) return;

        const updates = Array.from(this.updateBatch.entries()).map(([id, position]) => ({
            id,
            position: {
                x: position.x,
                y: position.y,
                z: position.z
            }
        }));

        this.websocketService.sendNodeUpdates(updates);
        this.updateBatch.clear();
    }

    public update(): void {
        if (!this.interactionEnabled) return;
        this.scheduleFlush();
    }

    public dispose(): void {
        // Clear subscriptions
        this.settingsUnsubscribers.forEach(unsub => unsub());
        this.settingsUnsubscribers = [];

        // Flush any pending updates
        this.flushPositionUpdates();

        XRInteraction.instance = null;
    }
}
