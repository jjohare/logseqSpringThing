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
            // First, check local storage for cached settings to avoid waiting for server
            const storedJson = localStorage.getItem(this.LOCAL_STORAGE_KEY);
            let cachedSettings: Settings | null = null;
            
            if (storedJson) {
                try {
                    const stored: StoredSettings = JSON.parse(storedJson);
                    
                    // Version check
                    if (stored.version !== this.SETTINGS_VERSION) {
                        logger.warn('Settings version mismatch, will try to migrate');
                        cachedSettings = this.migrateSettings(stored.settings);
                    } 
                    // Pubkey check
                    else if (stored.pubkey && stored.pubkey !== this.currentPubkey) {
                        logger.warn('Settings pubkey mismatch:', createDataMetadata({
                            stored: stored.pubkey,
                            current: this.currentPubkey
                        }));
                        // Don't use these settings, but don't set cachedSettings to null
                    } else {
                        // Validate loaded settings
                        const validation = validateSettings(stored.settings);
                        if (validation.isValid) {
                            cachedSettings = stored.settings;
                            logger.debug('Using cached settings while fetching from server');
                        } else {
                            logger.warn('Invalid stored settings, will try server');
                        }
                    }
                } catch (parseError) {
                    logger.warn('Failed to parse stored settings:', createErrorMetadata(parseError));
                }
            }
            
            // Start server request in parallel, but don't wait for it to complete before returning cached settings
            const serverPromise = (async () => {
                try {
                    // Use public settings endpoint if not authenticated
                    if (!this.currentPubkey) {
                        logger.debug('No pubkey available, loading public settings');
                        return await this.loadPublicSettings();
                    } else {
                        const serverSettings = await this.loadFromServer();
                        if (serverSettings) {                        
                            return serverSettings;
                        }
                    }
                } catch (error) {
                    logger.warn('Failed to load settings from server:', createErrorMetadata(error));
                    throw error;
                }
                return null;
            })();
            
            // If we have cached settings, return them immediately and update in background
            if (cachedSettings) {
                // Update from server in background
                serverPromise.then(serverSettings => {
                    if (serverSettings) {
                        // Store updated settings in local storage
                        const storedSettings = { 
                            settings: serverSettings, 
                            timestamp: Date.now(), 
                            version: this.SETTINGS_VERSION, 
                            pubkey: this.currentPubkey 
                        };
                        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(storedSettings));
                        logger.info('Updated cached settings from server in background');
                    }
                }).catch(error => {
                    logger.warn('Background settings update failed:', createErrorMetadata(error));
                });
                
                return cachedSettings;
            }
            
            // If no cached settings, wait for server response
            try {
                const serverSettings = await serverPromise;
                if (serverSettings) {
                    return serverSettings;
                }
            } catch (error) {
                logger.warn('Failed to load settings from server after cache miss:', createErrorMetadata(error));
            }

            // No cached settings and server failed, use defaults
            logger.info('Using default settings as fallback');
            return { ...defaultSettings };
        } catch (error) {
            logger.error('Failed to load settings:', createErrorMetadata(error));
            return { ...defaultSettings };
        }
    }

    private async syncToServer(storedSettings: StoredSettings): Promise<void> {
        const MAX_RETRIES = 3;
        const INITIAL_TIMEOUT = 5000; // 5 seconds
        const MAX_TIMEOUT = 30000; // 30 seconds
        let retryCount = 0;
        let timeout = INITIAL_TIMEOUT;

        while (retryCount <= MAX_RETRIES) {
            try {
                // Use different endpoint based on auth status
                // Power users use /settings to modify global settings
                // Regular users use /settings/sync for their personal settings
                const endpoint = this.isPowerUser ? 
                    API_ENDPOINTS.SETTINGS_ROOT : 
                    `${API_ENDPOINTS.SETTINGS_ROOT}/sync`;

                logger.debug(`Syncing settings to server (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
                
                // Create an AbortController for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                const response = await fetch(buildApiUrl(endpoint), {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(storedSettings.settings),
                    signal: controller.signal
                }).finally(() => clearTimeout(timeoutId));

                if (!response.ok) {
                    const errorText = await response.text();
                    if (response.status === 403) {
                        throw new Error(`Permission denied: ${this.isPowerUser ? 'Power user validation failed' : 'Regular user attempted to modify global settings'}`);
                    } else {
                        throw new Error(`Server returned ${response.status}: ${errorText}`);
                    }
                }

                logger.info('Settings synced to server successfully');
                return; // Success - exit the retry loop
            } catch (error) {
                retryCount++;
                
                if (error instanceof DOMException && error.name === 'AbortError') {
                    logger.warn(`Settings sync timed out after ${timeout}ms`);
                } else {
                    logger.error('Failed to sync settings to server:', createErrorMetadata(error));
                }
                
                if (retryCount <= MAX_RETRIES) {
                    // Exponential backoff with jitter
                    const jitter = Math.random() * 1000;
                    timeout = Math.min(timeout * 1.5 + jitter, MAX_TIMEOUT);
                    logger.info(`Retrying settings sync in ${Math.round(timeout/1000)}s (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
                    await new Promise(resolve => setTimeout(resolve, timeout));
                } else {
                    logger.error(`Failed to sync settings after ${MAX_RETRIES + 1} attempts`);
                    throw error;
                }
            }
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
        const TIMEOUT = 8000; // 8 seconds timeout for loading settings
        
        try {
            // Use different endpoint based on auth status
            // Power users get global settings from /settings
            // Regular users get personal settings from /settings/sync
            const endpoint = this.isPowerUser ? 
                API_ENDPOINTS.SETTINGS_ROOT : 
                `${API_ENDPOINTS.SETTINGS_ROOT}/sync`;

            // Create an AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
            
            logger.debug(`Loading settings from server with ${TIMEOUT}ms timeout`);
            const response = await fetch(buildApiUrl(endpoint), {
                headers: getAuthHeaders(),
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

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
            logger.info('Successfully loaded and cached settings from server');

            return serverSettings;
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                logger.error(`Settings load timed out after ${TIMEOUT}ms`);
                throw new Error(`Settings load timed out after ${TIMEOUT}ms`);
            }
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