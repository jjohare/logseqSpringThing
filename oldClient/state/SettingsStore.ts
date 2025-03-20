import { Settings } from '../types/settings/base';
import { createLogger, createErrorMetadata, createMessageMetadata, createDataMetadata } from '../core/logger';
import { defaultSettings } from './defaultSettings';
import { nostrAuth } from '../services/NostrAuthService';
import { buildApiUrl, getAuthHeaders } from '../core/api';
import { API_ENDPOINTS } from '../core/constants';
import { Logger, LoggerConfig } from '../core/logger';
import { validateSettings, validateSettingValue, ValidationError } from '../types/settings/validation';
import { convertObjectKeysToSnakeCase, convertObjectKeysToCamelCase } from '../core/utils';

const logger = createLogger('SettingsStore');

export type SettingsChangeCallback = (path: string, value: unknown) => void;
export type ValidationErrorCallback = (errors: ValidationError[]) => void;

export class SettingsStore {
    private static instance: SettingsStore | null = null;
    private settings: Settings;
    private initialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;
    private subscribers: Map<string, SettingsChangeCallback[]> = new Map();
    private validationSubscribers: ValidationErrorCallback[] = [];
    private logger: Logger;
    private retryCount: number = 0;
    private readonly MAX_RETRIES: number = 3;
    private readonly RETRY_DELAY: number = 1000;
    private settingsOrigin: 'server' | 'default' = 'default';
    private _isUserLoggedIn: boolean = false;
    private _restrictedSettings: Set<string> = new Set();

    private constructor() {
        this.settings = { ...defaultSettings };
        this.subscribers = new Map();
        this.logger = createLogger('SettingsStore');
    }

    public static getInstance(): SettingsStore {
        if (!SettingsStore.instance) {
            SettingsStore.instance = new SettingsStore();
        }
        return SettingsStore.instance;
    }

    /**
     * Set user login status for settings authorization
     */
    public setUserLoggedIn(isLoggedIn: boolean): void {
        this._isUserLoggedIn = isLoggedIn;
        this.updateRestrictedSettings();
    }

    /**
     * Check if settings are loaded from server
     */
    public isUserLoggedIn(): boolean {
        return this._isUserLoggedIn;
    }

    /**
     * Update the list of restricted settings based on user role
     */
    private updateRestrictedSettings(): void {
        this._restrictedSettings.clear();
        
        // If not logged in, restrict all server-only settings
        if (!this._isUserLoggedIn) {
            this._restrictedSettings.add('system.advanced');
            this._restrictedSettings.add('perplexity');
            this._restrictedSettings.add('openai');
            this._restrictedSettings.add('ragflow');
            return;
        }

        // If logged in but not a power user, restrict power user settings
        if (!nostrAuth.isPowerUser()) {
            this._restrictedSettings.add('system.advanced');
        }

        // Add feature-specific restrictions based on user access
        if (!nostrAuth.hasFeatureAccess('perplexity')) this._restrictedSettings.add('perplexity');
        if (!nostrAuth.hasFeatureAccess('openai')) this._restrictedSettings.add('openai');
        if (!nostrAuth.hasFeatureAccess('ragflow')) this._restrictedSettings.add('ragflow');
    }

    private isSettingRestricted(path: string): boolean {
        return Array.from(this._restrictedSettings).some(prefix => path.startsWith(prefix));
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            return Promise.resolve();
        }
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                // Start with default settings immediately to avoid waiting for server
                this.settings = { ...defaultSettings };
                this.settingsOrigin = 'default';
                
                // Initialize logger with default settings
                if (this.settings.system?.debug) {
                    LoggerConfig.setGlobalDebug(this.settings.system.debug.enabled);
                    LoggerConfig.setFullJson(this.settings.system.debug.logFullJson);
                }
                
                // Mark as initialized with defaults
                this.initialized = true;
                logger.info('SettingsStore initialized with defaults');

                this.initialized = true;
                logger.info('SettingsStore initialized with defaults, server settings will be loaded on login');
            } catch (error) {
                logger.error('Settings initialization failure:', createErrorMetadata(error));
                // Last resort: use defaults without validation
                this.settings = { ...defaultSettings };
                this.settingsOrigin = 'default';
                this.initialized = true;
            }
        })();

        return this.initializationPromise;
    }

    public isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Load settings from server
     * This should be called after user logs in with Nostr
     */
    public async loadServerSettings(): Promise<boolean> {
        if (!this._isUserLoggedIn) {
            logger.warn('Attempting to load server settings without user login');
            return false;
        }
        
        try {
            logger.info('Loading settings from server after user login');
            const settingsUrl = buildApiUrl(API_ENDPOINTS.SETTINGS_ROOT);
            const response = await fetch(settingsUrl, {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Failed to load server settings:', createMessageMetadata(errorText));
                return false;
            }
            
            const serverSettings = await response.json();
            logger.info('Received server settings:', createDataMetadata(serverSettings));
            
            // Convert snake_case to camelCase
            const camelCaseSettings = convertObjectKeysToCamelCase(serverSettings);
            
            // Validate server settings
            const serverValidation = validateSettings(camelCaseSettings);
            if (!serverValidation.isValid) {
                throw new Error(`Invalid server settings: ${JSON.stringify(serverValidation.errors)}`);
            }
            
            // Use server settings as base, filling in any missing fields with defaults
            this.settings = this.deepMerge(this.settings, camelCaseSettings);
            this.settingsOrigin = 'server';
            
            // Update logger configuration from settings
            if (this.settings.system?.debug) {
                LoggerConfig.setGlobalDebug(this.settings.system.debug.enabled);
                LoggerConfig.setFullJson(this.settings.system.debug.logFullJson);
            }
            logger.info('Updated settings from server after login');
            return true;
        } catch (error) {
            logger.error('Error loading server settings:', createErrorMetadata(error));
            return false;
        }
    }

    public get(path: string): unknown {
        if (!this.initialized) {
            logger.warn('Attempting to access settings before initialization');
            return undefined;
        }
        
        if (!path) {
            return this.settings;
        }
        
        try {
            return path.split('.').reduce((obj: any, key) => {
                if (obj === null || obj === undefined) {
                    throw new Error(`Invalid path: ${path}`);
                }
                return obj[key];
            }, this.settings);
        } catch (error) {
            logger.error(`Error accessing setting at path ${path}:`, createErrorMetadata(error));
            return undefined;
        }
    }

    public subscribeToValidationErrors(callback: ValidationErrorCallback): () => void {
        this.validationSubscribers.push(callback);
        return () => {
            const index = this.validationSubscribers.indexOf(callback);
            if (index > -1) {
                this.validationSubscribers.splice(index, 1);
            }
        };
    }

    public async subscribe(path: string, callback: SettingsChangeCallback, immediate: boolean = false): Promise<() => void> {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, []);
        }
        
        const subscribers = this.subscribers.get(path);
        if (subscribers) {
            subscribers.push(callback);
        }

        // Only call callback immediately if explicitly requested
        if (immediate) {
            const value = this.get(path);
            if (value !== undefined) {
                callback(path, value);
            }
        }

        return () => {
            const pathSubscribers = this.subscribers.get(path);
            if (pathSubscribers) {
                const index = pathSubscribers.indexOf(callback);
                if (index > -1) {
                    pathSubscribers.splice(index, 1);
                }
                if (pathSubscribers.length === 0) {
                    this.subscribers.delete(path);
                }
            }
        };
    }

    public async set(path: string, value: unknown): Promise<void> {
        try {
            // Check if setting is restricted
            if (this.isSettingRestricted(path)) {
                const error = `Setting ${path} is restricted based on user role`;
                this.logger.warn(error);
                throw new Error(error);
            }

            // Validate the specific setting change
            // Update logger config if debug settings change
            if (path.startsWith('system.debug')) {
                if (path === 'system.debug.enabled') {
                    LoggerConfig.setGlobalDebug(value as boolean);
                } else if (path === 'system.debug.logFullJson') {
                    LoggerConfig.setFullJson(value as boolean);
                }
            }
            const validationErrors = validateSettingValue(path, value, this.settings);
            if (validationErrors.length > 0) {
                this.notifyValidationErrors(validationErrors);
                throw new Error(`Validation failed: ${JSON.stringify(validationErrors)}`);
            }
            
            // Create a copy of settings for rollback
            const previousSettings = JSON.parse(JSON.stringify(this.settings));
            const previousOrigin = this.settingsOrigin;
            
            // Update local state
            this.updateSettingValue(path, value);
            // Mark as modified from default since this is a user action
            this.settingsOrigin = 'default';
            
            // Validate entire settings object after update
            const fullValidation = validateSettings(this.settings);
            if (!fullValidation.isValid) {
                // Rollback and notify of validation errors
                this.settings = previousSettings;
                this.settingsOrigin = previousOrigin;
                this.notifyValidationErrors(fullValidation.errors);
                throw new Error(`Full validation failed: ${JSON.stringify(fullValidation.errors)}`);
            }
            
            // Sync with server (not an initial sync)
            try {
                await this.syncWithServer(false);
            } catch (error) {
                // Rollback on server sync failure
                this.settings = previousSettings;
                this.settingsOrigin = previousOrigin;
                this.notifySubscribers(path, this.get(path));
                throw error;
            }
            
            // Notify subscribers of successful update
            this.notifySubscribers(path, value);
            
            this.logger.debug(`Setting updated successfully: ${path}`, createDataMetadata({
                value,
                origin: this.settingsOrigin
            }));
        } catch (error) {
            this.logger.error(`Failed to update setting: ${path}`, createErrorMetadata(error));
            throw error;
        }
    }

    public isFromServer(): boolean {
        return this.settingsOrigin === 'server';
    }

    // Prepare settings for sync, respecting user role restrictions
    private prepareSettingsForSync(settings: Settings): any {
        // Create a copy of settings
        const preparedSettings = JSON.parse(JSON.stringify(settings));

        // Ensure required sections exist
        if (!preparedSettings.system) preparedSettings.system = {};
        if (!preparedSettings.system.debug) preparedSettings.system.debug = {};
        if (!preparedSettings.xr) preparedSettings.xr = {};
        
        // Remove restricted settings based on user role
        for (const restrictedPath of this._restrictedSettings) {
            const parts = restrictedPath.split('.');
            let current = preparedSettings;
            for (let i = 0; i < parts.length - 1; i++) {
                if (current[parts[i]]) delete current[parts[i]][parts[i + 1]];
            }
        }

        // Always include all required debug fields
        preparedSettings.system.debug = {
            enabled: preparedSettings.system.debug.enabled ?? false,
            enableDataDebug: preparedSettings.system.debug.enableDataDebug ?? false,
            enableWebsocketDebug: preparedSettings.system.debug.enableWebsocketDebug ?? false,
            logBinaryHeaders: preparedSettings.system.debug.logBinaryHeaders ?? false,
            logFullJson: preparedSettings.system.debug.logFullJson ?? false,
            logLevel: preparedSettings.system.debug.logLevel ?? 'info',
            logFormat: preparedSettings.system.debug.logFormat ?? 'json'
        };

        // Always include required XR fields
        const defaultXR = defaultSettings.xr;
        preparedSettings.xr = {
            ...preparedSettings.xr,
            gestureSmoothing: preparedSettings.xr.gestureSmoothing ?? defaultXR.gestureSmoothing,
            mode: preparedSettings.xr.mode ?? defaultXR.mode,
            roomScale: preparedSettings.xr.roomScale ?? defaultXR.roomScale,
            spaceType: preparedSettings.xr.spaceType ?? defaultXR.spaceType,
            quality: preparedSettings.xr.quality ?? defaultXR.quality,
            enableHandTracking: preparedSettings.xr.enableHandTracking ?? defaultXR.enableHandTracking,
            handMeshEnabled: preparedSettings.xr.handMeshEnabled ?? defaultXR.handMeshEnabled,
            handMeshColor: preparedSettings.xr.handMeshColor ?? defaultXR.handMeshColor,
            handMeshOpacity: preparedSettings.xr.handMeshOpacity ?? defaultXR.handMeshOpacity,
            handPointSize: preparedSettings.xr.handPointSize ?? defaultXR.handPointSize,
            handRayEnabled: preparedSettings.xr.handRayEnabled ?? defaultXR.handRayEnabled,
            handRayColor: preparedSettings.xr.handRayColor ?? defaultXR.handRayColor,
            handRayWidth: preparedSettings.xr.handRayWidth ?? defaultXR.handRayWidth,
            movementAxes: preparedSettings.xr.movementAxes ?? defaultXR.movementAxes
        };

        // Convert to snake_case for server
        return convertObjectKeysToSnakeCase(preparedSettings);
    }

    private async syncWithServer(isInitialSync: boolean = false): Promise<void> {
        // Don't sync to server during initialization if we got settings from server
        if (!this._isUserLoggedIn) {
            this.logger.debug('Skipping sync to server - user not logged in');
            return;
        }

        try {
            // Prepare settings for server sync
            const serverSettings = this.prepareSettingsForSync(this.settings);
            
            this.logger.debug('Sending settings to server:', createDataMetadata({
                origin: this.settingsOrigin,
                isInitialSync,
                debug: serverSettings.system?.debug
            }));
            
            // Use the existing getAuthHeaders function to get headers with Nostr pubkey
            const headers = getAuthHeaders();
            this.logger.debug('Using auth headers for settings sync');
                        
            const response = await fetch(buildApiUrl(API_ENDPOINTS.SETTINGS_ROOT), {
                method: 'POST',
                headers,
                body: JSON.stringify(serverSettings)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error('Server sync failed:', createDataMetadata({
                    status: response.status,
                    error: errorText,
                    sentSettings: serverSettings.system?.debug
                }));
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }
            
            // Convert server response back to camelCase
            const responseData = await response.json();
            const camelCaseSettings = convertObjectKeysToCamelCase(responseData);
            
            this.logger.debug('Received settings from server:', createDataMetadata({
                debug: camelCaseSettings.system?.debug
            }));
            
            // Validate server response
            const validationResult = validateSettings(camelCaseSettings);
            if (!validationResult.isValid) {
                this.logger.error('Settings validation failed:', createDataMetadata({
                    errors: validationResult.errors,
                    receivedSettings: camelCaseSettings.system?.debug
                }));
                throw new Error(`Invalid server response: ${JSON.stringify(validationResult.errors)}`);
            }
            
            this.settings = this.deepMerge(this.settings, camelCaseSettings);
            this.logger.debug('Settings synced successfully:', createDataMetadata({
                finalDebug: this.settings.system?.debug
            }));
        } catch (error) {
            this.logger.error('Failed to sync settings with server:', createErrorMetadata(error));
            if (this.retryCount < this.MAX_RETRIES) {
                this.retryCount++;
                this.logger.info(`Retrying sync (attempt ${this.retryCount}/${this.MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                return this.syncWithServer();
            }
            throw error;
        }
    }

    private notifyValidationErrors(errors: ValidationError[]): void {
        this.validationSubscribers.forEach(callback => {
            try {
                callback(errors);
            } catch (error) {
                this.logger.error('Error in validation subscriber:', createErrorMetadata(error));
            }
        });
    }

    private notifySubscribers(path: string, value: unknown): void {
        const subscribers = this.subscribers.get(path);
        if (subscribers) {
            let scheduledCallbacks = new Set<SettingsChangeCallback>();
            
            subscribers.forEach(callback => {
                try {
                    if (!scheduledCallbacks.has(callback)) {
                        scheduledCallbacks.add(callback);
                        window.requestAnimationFrame(() => {
                            if (scheduledCallbacks.has(callback)) {
                                callback(path, value);
                            }
                        });
                    }
                } catch (error) {
                    this.logger.error(`Error scheduling settings notification for ${path}:`, createErrorMetadata(error));
                }
            });
        }
    }

    private deepMerge(target: any, source: any): any {
        const result = { ...target };
        
        // Handle arrays
        if (Array.isArray(source)) {
            return [...source];
        }
        
        if (source && typeof source === 'object') {
            Object.keys(source).forEach(key => {
                if (source[key] instanceof Object && !Array.isArray(source[key])) {
                    result[key] = this.deepMerge(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            });
        }
        
        return result;
    }

    private updateSettingValue(path: string, value: unknown): void {
        if (!path) {
            throw new Error('Setting path cannot be empty');
        }

        const parts = path.split('.');
        const section = parts[0];
        const lastKey = parts.pop()!;

        // Create a new settings object with the updated value
        this.settings = this.deepUpdate(this.settings, parts, lastKey, value);

        // If this is an XR setting, ensure all required fields are present
        if (section === 'xr') {
            const currentXR = this.settings.xr;
            const defaultXR = defaultSettings.xr;

            // Ensure all required XR fields are present with defaults
            this.settings.xr = {
                ...currentXR,
                mode: currentXR.mode ?? defaultXR.mode,
                roomScale: currentXR.roomScale ?? defaultXR.roomScale,
                spaceType: currentXR.spaceType ?? defaultXR.spaceType,
                quality: currentXR.quality ?? defaultXR.quality,
                gestureSmoothing: currentXR.gestureSmoothing ?? defaultXR.gestureSmoothing,
                enableHandTracking: currentXR.enableHandTracking ?? defaultXR.enableHandTracking,
                handMeshEnabled: currentXR.handMeshEnabled ?? defaultXR.handMeshEnabled,
                handMeshColor: currentXR.handMeshColor ?? defaultXR.handMeshColor,
                handMeshOpacity: currentXR.handMeshOpacity ?? defaultXR.handMeshOpacity,
                handPointSize: currentXR.handPointSize ?? defaultXR.handPointSize,
                handRayEnabled: currentXR.handRayEnabled ?? defaultXR.handRayEnabled,
                handRayColor: currentXR.handRayColor ?? defaultXR.handRayColor,
                handRayWidth: currentXR.handRayWidth ?? defaultXR.handRayWidth,
                movementAxes: currentXR.movementAxes ?? defaultXR.movementAxes
            };
        }
    }

    private deepUpdate(obj: any, path: string[], lastKey: string, value: unknown): any {
        if (path.length === 0) {
            return { ...obj, [lastKey]: value };
        }

        const key = path.shift()!;
        return {
            ...obj,
            [key]: this.deepUpdate(obj[key] || {}, path, lastKey, value)
        };
    }

    public dispose(): void {
        this.subscribers.clear();
        this.validationSubscribers = [];
        this.settings = { ...defaultSettings };
        SettingsStore.instance = null;
    }
}
