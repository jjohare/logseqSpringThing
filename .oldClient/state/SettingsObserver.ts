import { SettingsStore } from './SettingsStore';
import { VisualizationController } from '../rendering/VisualizationController';
import { createLogger, createErrorMetadata } from '../core/logger';

const logger = createLogger('SettingsObserver');

type SettingsCallback = (path: string, value: any) => void;

export class SettingsObserver {
    private static instance: SettingsObserver | null = null;
    private settingsStore: SettingsStore;
    private visualizationController: VisualizationController;
    private callbacks: Map<string, Set<SettingsCallback>>;
    private updateTimeout: number | null = null;
    private readonly UPDATE_DELAY = 16; // ~60fps

    private constructor() {
        this.settingsStore = SettingsStore.getInstance();
        this.visualizationController = VisualizationController.getInstance();
        this.callbacks = new Map();
        this.initializeObserver();
    }

    public static getInstance(): SettingsObserver {
        if (!SettingsObserver.instance) {
            SettingsObserver.instance = new SettingsObserver();
        }
        return SettingsObserver.instance;
    }

    private async initializeObserver(): Promise<void> {
        try {
            await this.settingsStore.initialize();
            this.subscribeToSettings();
            logger.info('Settings observer initialized');
        } catch (error) {
            logger.error('Failed to initialize settings observer:', createErrorMetadata(error));
        }
    }

    private subscribeToSettings(): void {
        // Subscribe to all visualization settings
        this.settingsStore.subscribe('visualization', (path, value) => {
            this.handleVisualizationUpdate(path, value);
        });

        // Subscribe to physics settings
        this.settingsStore.subscribe('physics', (path, value) => {
            this.handlePhysicsUpdate(path, value);
        });

        // Subscribe to rendering settings
        this.settingsStore.subscribe('rendering', (path, value) => {
            this.handleRenderingUpdate(path, value);
        });

        // Subscribe to XR settings
        this.settingsStore.subscribe('xr', (path, value) => {
            this.handleXRUpdate(path, value);
        });
    }

    private handleVisualizationUpdate(path: string, value: any): void {
        this.debounceUpdate(() => {
            this.visualizationController.updateSetting(path, value);
            this.notifyCallbacks(path, value);
        });
    }

    private handlePhysicsUpdate(path: string, value: any): void {
        this.debounceUpdate(() => {
            this.visualizationController.updateSetting(path, value);
            this.notifyCallbacks(path, value);
        });
    }

    private handleRenderingUpdate(path: string, value: any): void {
        this.debounceUpdate(() => {
            this.visualizationController.updateSetting(path, value);
            this.notifyCallbacks(path, value);
        });
    }

    private handleXRUpdate(path: string, value: any): void {
        // XR updates should be immediate
        this.visualizationController.updateSetting(path, value);
        this.notifyCallbacks(path, value);
    }

    private debounceUpdate(callback: () => void): void {
        if (this.updateTimeout !== null) {
            window.clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = window.setTimeout(() => {
            callback();
            this.updateTimeout = null;
        }, this.UPDATE_DELAY);
    }

    public subscribe(path: string, callback: SettingsCallback): () => void {
        if (!this.callbacks.has(path)) {
            this.callbacks.set(path, new Set());
        }

        const callbacks = this.callbacks.get(path)!;
        callbacks.add(callback);

        // Immediately call with current value
        const currentValue = this.settingsStore.get(path);
        if (currentValue !== undefined) {
            callback(path, currentValue);
        }

        // Return unsubscribe function
        return () => {
            const callbacks = this.callbacks.get(path);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.callbacks.delete(path);
                }
            }
        };
    }

    private notifyCallbacks(path: string, value: any): void {
        // Notify callbacks for exact path match
        const exactCallbacks = this.callbacks.get(path);
        if (exactCallbacks) {
            exactCallbacks.forEach(callback => {
                try {
                    callback(path, value);
                } catch (error) {
                    logger.error(`Error in settings callback for ${path}:`, createErrorMetadata(error));
                }
            });
        }

        // Notify callbacks for parent paths
        const parts = path.split('.');
        while (parts.length > 1) {
            parts.pop();
            const parentPath = parts.join('.');
            const parentCallbacks = this.callbacks.get(parentPath);
            if (parentCallbacks) {
                parentCallbacks.forEach(callback => {
                    try {
                        callback(path, value);
                    } catch (error) {
                        logger.error(`Error in settings callback for ${parentPath}:`, createErrorMetadata(error));
                    }
                });
            }
        }
    }

    public dispose(): void {
        if (this.updateTimeout !== null) {
            window.clearTimeout(this.updateTimeout);
        }
        this.callbacks.clear();
        SettingsObserver.instance = null;
    }
}
