import { XRSessionManager } from './xrSessionManager';
import { SettingsStore } from '../state/SettingsStore';
import { createLogger, createErrorMetadata } from '../core/logger';
import { WebSocketService } from '../websocket/websocketService';
import { XRSettings } from '../types/settings/xr';
import { platformManager } from '../platform/platformManager';
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
    private sessionStateListener: ((state: string) => void) | null = null;

    private xrManager: XRSessionManager;
    private constructor(xrManager: XRSessionManager) {
        this.xrManager = xrManager;
        this.settingsStore = SettingsStore.getInstance();
        this.websocketService = WebSocketService.getInstance();
        this.initializeSettings();
        this.setupSessionStateListener();
        
        // Only auto-enter AR if explicitly enabled
        setTimeout(() => {
            this.initializeXRSession();
        }, 1000);
    }
    
    private setupSessionStateListener(): void {
        // Listen for session state changes to reset interaction state
        this.sessionStateListener = (state: string) => {
            if (state === 'ending' || state === 'cooldown') {
                this.clearHandState();
            }
        };
        platformManager.on('xrsessionstatechange', this.sessionStateListener);
    }

    private async initializeXRSession(): Promise<void> {
        try {
            const settings = this.settingsStore.get('xr') as XRSettings;
            if (platformManager.isQuest() && settings?.autoEnterAR && platformManager.xrSessionState === 'inactive') {
                await this.xrManager.initXRSession();
            }
        } catch (error) {
            logger.error('Failed to initialize XR session:', createErrorMetadata(error));
        }
    }

    private initializeSettings(): void {
        try {
            this.setupSettingsSubscription();
        } catch (error) {
            logger.error('Failed to setup settings subscription:', createErrorMetadata(error));
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
            position: position.clone()
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
        
        // Remove session state listener
        if (this.sessionStateListener) {
            platformManager.removeAllListeners();
        }

        // Flush any pending updates
        this.flushPositionUpdates();

        XRInteraction.instance = null;
    }
}
