import { Settings } from '../types/settings';
import { createLogger, createErrorMetadata } from '../core/logger';
import { SettingsStore } from './SettingsStore';
import { defaultSettings } from './defaultSettings';
import {
    SettingsCategory,
    SettingsPath,
    SettingsValue,
    getSettingValue,
    setSettingValue,
    isValidSettingPath
} from '../types/settings/utils';
import { VisualizationController } from '../rendering/VisualizationController';

const logger = createLogger('SettingsManager');

export class SettingsManager {
    private store: SettingsStore;
    private initialized: boolean = false;
    private _storeInitialized: boolean = false;
    private settings: Settings = { ...defaultSettings };

    constructor() {
        // Defer SettingsStore initialization to avoid circular dependencies
        this.store = null as any;
        this.settings = { ...defaultSettings };
    }
    
    private getStore = () => this.store || (this.store = SettingsStore.getInstance());

    public async initialize(): Promise<void> {
        if (this.initialized) return;

        // Initialize with default settings
        this.settings = { ...defaultSettings };
        
        // Initialize the store reference
        this.store = SettingsStore.getInstance();
        this._storeInitialized = true;
        
        // Initialize the store but don't load server settings yet
        try {
            await this.getStore().initialize();
            
            // If the user is already logged in (session restored), we might have server settings
            if (this.getStore().isUserLoggedIn()) {
                this.settings = this.getStore().get('') as Settings;
                logger.info('Settings initialized from server (user logged in)');
            } else {
                logger.info('Settings initialized with defaults (user not logged in)');
            }
        } catch (error) {
            logger.error('Failed to initialize settings store:', createErrorMetadata(error));
            // Already using default settings
        }
        
        this.initialized = true;
    }

    /**
     * Called when user logs in with Nostr to update settings
     */
    public updateSettingsFromServer(): void {
        if (this._storeInitialized && this.getStore().isUserLoggedIn()) {
            // Get the latest settings from the store which should have loaded them from server
            this.settings = this.getStore().get('') as Settings;
            logger.info('Settings updated from server after user login');

            // Force refresh of visualization with new settings
            try {
                const visualizationController = VisualizationController.getInstance();
                // Pass the complete settings object to the visualization controller
                logger.info('Forcing visualization refresh with updated server settings');
                visualizationController.refreshSettings(this.settings);
            } catch (error) {
                logger.warn('Failed to refresh visualization from settings manager:', createErrorMetadata(error));
            }
        }
    }

    public getCurrentSettings(): Settings {
        // Always return settings, which will be defaults if initialization failed
        return this.settings;
    }

    public async updateSetting(path: SettingsPath, value: SettingsValue): Promise<void> {
        if (!isValidSettingPath(this.settings, path)) {
            throw new Error(`Invalid settings path: ${path}`);
        }

        try {
            setSettingValue(this.settings, path, value);
            if (this.initialized) {
                await this.getStore().set(path, value);
                if (!this.getStore().isUserLoggedIn()) {
                    logger.warn(`Setting ${path} updated, but won't be saved to server until user logs in`);
                }
            } else {
                logger.warn(`Setting ${path} updated in memory only - store not initialized`);
            }
            logger.debug(`Updated setting ${path} to ${value}`);
        } catch (error) {
            logger.error(`Failed to update setting ${path}:`, createErrorMetadata(error));
            throw error;
        }
    }

    public get(path: SettingsPath): SettingsValue {
        if (!isValidSettingPath(this.settings, path)) {
            throw new Error(`Invalid settings path: ${path}`);
        }
        
        try {
            return getSettingValue(this.settings, path)!;
        } catch (error) {
            logger.error(`Error getting setting at path ${path}:`, createErrorMetadata(error));
            // Return default value for this path if available
            return getSettingValue(defaultSettings, path)!;
        }
    }

    public getCategory(category: SettingsCategory): Settings[typeof category] {
        if (!(category in this.settings)) {
            logger.warn(`Category ${category} not found, using defaults`);
            return defaultSettings[category];
        }
        return this.settings[category];
    }

    public subscribe(path: string, callback: (value: unknown) => void): () => void {
        const store = SettingsStore.getInstance();
        let unsubscriber: (() => void) | undefined;
        
        store.subscribe(path, (_, value) => {
            callback(value);
        }).then(unsub => {
            unsubscriber = unsub;
        });

        return () => {
            if (unsubscriber) {
                unsubscriber();
            }
        };
    }

    public onSettingChange(path: SettingsPath, callback: (value: SettingsValue) => void): () => void {
        const store = SettingsStore.getInstance();
        let unsubscriber: (() => void) | undefined;
        
        store.subscribe(path, (_, value) => {
            callback(value as SettingsValue);
        }).then(unsub => {
            unsubscriber = unsub;
        });

        return () => {
            if (unsubscriber) {
                unsubscriber();
            }
        };
    }

    public async batchUpdate(updates: Array<{ path: SettingsPath; value: SettingsValue }>): Promise<void> {
        try {
            // Validate all paths first
            for (const { path } of updates) {
                if (!isValidSettingPath(this.settings, path)) {
                    throw new Error(`Invalid settings path: ${path}`);
                }
            }

            // Apply updates to local settings first
            for (const { path, value } of updates) {
                setSettingValue(this.settings, path, value);
            }

            // Then sync with store if initialized
            if (this.initialized) {
                await Promise.all(
                    updates.map(({ path, value }) => this.getStore().set(path, value))
                );
                if (!this.getStore().isUserLoggedIn()) {
                    logger.warn(`Settings batch updated, but won't be saved to server until user logs in`);
                }
            } else {
                logger.warn('Settings updated in memory only - store not initialized');
            }
        } catch (error) {
            logger.error('Failed to apply batch updates:', createErrorMetadata(error));
            throw error;
        }
    }

    public dispose(): void {
        if (this._storeInitialized) {
            this.getStore().dispose();
            this.store = null as any;
        }
        this.initialized = false;
    }
}

// Export singleton instance
export const settingsManager = new SettingsManager();
