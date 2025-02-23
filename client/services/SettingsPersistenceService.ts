import { Settings } from '../types/settings/base';
import { defaultSettings } from '../state/defaultSettings';
import { createLogger, createErrorMetadata, createDataMetadata } from '../core/logger';
import { validateSettings } from '../types/settings/validation';
import { buildApiUrl, getAuthHeaders } from '../core/api';
import { API_ENDPOINTS } from '../core/constants';

const logger = createLogger('SettingsPersistenceService');

export interface StoredSettings {
    settings: Settings;
    timestamp: number;
    version: string;
    pubkey?: string;
}

export class SettingsPersistenceService {
    private static instance: SettingsPersistenceService | null = null;
    private readonly LOCAL_STORAGE_KEY = 'logseq_spring_settings';
    private readonly SETTINGS_VERSION = '1.0.0';
    private isPowerUser: boolean = false;
    private currentPubkey: string | null = null;

    private constructor() {}

    public static getInstance(): SettingsPersistenceService {
        if (!SettingsPersistenceService.instance) {
            SettingsPersistenceService.instance = new SettingsPersistenceService();
        }
        return SettingsPersistenceService.instance;
    }

    public setCurrentUser(pubkey: string | null, isPowerUser: boolean = false): void {
        this.currentPubkey = pubkey;
        this.isPowerUser = isPowerUser;
        logger.debug('User state updated:', createDataMetadata({ pubkey, isPowerUser }));
    }

    public async saveSettings(settings: Settings): Promise<void> {
        try {
            // Validate settings before saving
            const validation = validateSettings(settings);
            if (!validation.isValid) {
                throw new Error(`Invalid settings: ${JSON.stringify(validation.errors)}`);
            }

            const storedSettings: StoredSettings = {
                settings,
                timestamp: Date.now(),
                version: this.SETTINGS_VERSION,
                pubkey: this.currentPubkey ?? undefined
            };

            // Save locally
            localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(storedSettings));

            // Always sync to server, endpoint depends on auth status
            try {
                await this.syncToServer(storedSettings);
            } catch (error) {
                logger.warn('Failed to sync settings to server:', createErrorMetadata(error));
            }

            logger.info('Settings saved successfully');
        } catch (error) {
            logger.error('Failed to save settings:', createErrorMetadata(error));
            throw error;
        }
    }

    public async loadSettings(): Promise<Settings> {
        try {            
            // Try to load from server
            // Use public settings endpoint if not authenticated
            if (!this.currentPubkey) {
                logger.debug('No pubkey available, loading public settings');
                return this.loadPublicSettings();
            } try {
                const serverSettings = await this.loadFromServer();
                if (serverSettings) {                        
                    return serverSettings;
                }
            } catch (error) {
                logger.warn('Failed to load settings from server:', createErrorMetadata(error));
            }

            // Fall back to local storage
            const storedJson = localStorage.getItem(this.LOCAL_STORAGE_KEY);
            if (storedJson) {
                const stored: StoredSettings = JSON.parse(storedJson);

                // Version check
                if (stored.version !== this.SETTINGS_VERSION) {
                    logger.warn('Settings version mismatch, using defaults');
                    return this.migrateSettings(stored.settings);
                }

                // Pubkey check
                if (stored.pubkey && stored.pubkey !== this.currentPubkey) {
                    logger.warn('Settings pubkey mismatch:', createDataMetadata({
                        stored: stored.pubkey,
                        current: this.currentPubkey
                    }));
                    return { ...defaultSettings };
                }

                // Validate loaded settings
                const validation = validateSettings(stored.settings);
                if (!validation.isValid) {
                    logger.warn('Invalid stored settings, using defaults');
                    return { ...defaultSettings };
                }

                return stored.settings;
            }

            // No stored settings found, use defaults
            return { ...defaultSettings };
        } catch (error) {
            logger.error('Failed to load settings:', createErrorMetadata(error));
            return { ...defaultSettings };
        }
    }

    private async syncToServer(storedSettings: StoredSettings): Promise<void> {
        try {
            // Use different endpoint based on auth status
            // Power users use /settings to modify global settings
            // Regular users use /settings/sync for their personal settings
            const endpoint = this.isPowerUser ? 
                API_ENDPOINTS.SETTINGS_ROOT : 
                `${API_ENDPOINTS.SETTINGS_ROOT}/sync`;

            const response = await fetch(buildApiUrl(endpoint), {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(storedSettings.settings)
            });

            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 403) {
                    throw new Error(`Permission denied: ${this.isPowerUser ? 'Power user validation failed' : 'Regular user attempted to modify global settings'}`);
                } else {
                    throw new Error(`Server returned ${response.status}: ${errorText}`);
                }
            }

            logger.info('Settings synced to server');
        } catch (error) {
            logger.error('Failed to sync settings to server:', createErrorMetadata(error));
            throw error;
        }
    }

    private async loadPublicSettings(): Promise<Settings> {
        try {
            const response = await fetch(buildApiUrl(API_ENDPOINTS.SETTINGS_ROOT), {
                method: 'GET',
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${await response.text()}`);
            }

            const settings = await response.json() as Settings;
            
            // Additional validation for required sections
            if (!settings || !settings.system || !settings.xr) {
                logger.error('Invalid server settings: Missing required sections');
                return { ...defaultSettings };
            }

            const validation = validateSettings(settings);
            if (!validation.isValid) {
                throw new Error(`Invalid server settings: ${JSON.stringify(validation.errors)}`);
            }

            return settings;
        } catch (error) {
            logger.error('Failed to load public settings:', createErrorMetadata(error));
            return { ...defaultSettings };
        }
    }

    private async loadFromServer(): Promise<Settings | null> {
        try {
            // Use different endpoint based on auth status
            // Power users get global settings from /settings
            // Regular users get personal settings from /settings/sync
            const endpoint = this.isPowerUser ? 
                API_ENDPOINTS.SETTINGS_ROOT : 
                `${API_ENDPOINTS.SETTINGS_ROOT}/sync`;

            const response = await fetch(buildApiUrl(endpoint), {
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                const errorText = await response.text();
                if (response.status === 403) {
                    throw new Error(`Permission denied: ${this.isPowerUser ? 'Power user validation failed' : 'Regular user attempted to access global settings'}`);
                } else {
                    throw new Error(`Server returned ${response.status}: ${errorText}`);
                }
            }

            const serverSettings = await response.json() as Settings;
            
            // Additional validation for required sections
            if (!serverSettings || !serverSettings.system || !serverSettings.xr) {
                logger.error('Invalid server settings: Missing required sections');
                throw new Error('Server returned invalid settings structure');
            }


            // Validate server settings
            const validation = validateSettings(serverSettings);
            if (!validation.isValid) {
                throw new Error(`Invalid server settings: ${JSON.stringify(validation.errors)}`);
            }

            // Store in local storage with version and pubkey
            const storedSettings = { settings: serverSettings, timestamp: Date.now(), version: this.SETTINGS_VERSION, pubkey: this.currentPubkey };
            localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(storedSettings));

            return serverSettings;
        } catch (error) {
            logger.error('Failed to load settings from server:', createErrorMetadata(error));
            throw error;
        }
    }

    private migrateSettings(oldSettings: Settings): Settings {
        // Implement version-specific migrations here
        logger.info('Migrating settings from older version');
        
        // For now, just merge with defaults
        return {
            ...defaultSettings,
            ...oldSettings,
            // Ensure critical sections are preserved
            system: {
                ...defaultSettings.system,
                ...oldSettings.system
            },
            xr: {
                ...defaultSettings.xr,
                ...oldSettings.xr
            }
        };
    }

    public clearSettings(): void {
        localStorage.removeItem(this.LOCAL_STORAGE_KEY);
        this.isPowerUser = false;  // Reset power user status on clear
        logger.info('Settings cleared');
    }

    public dispose(): void {
        SettingsPersistenceService.instance = null;
    }
}