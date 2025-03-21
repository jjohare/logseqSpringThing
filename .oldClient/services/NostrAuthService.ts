import { SettingsEventEmitter, SettingsEventType } from './SettingsEventEmitter';
import { SettingsStore } from '../state/SettingsStore';
import { SettingsPersistenceService } from './SettingsPersistenceService';
import { settingsManager } from '../state/settings';
import { createLogger, createErrorMetadata, createDataMetadata } from '../core/logger';
import { buildApiUrl } from '../core/api';
import { Settings } from '../types/settings/base';
import { VisualizationController } from '../rendering/VisualizationController';
import { API_ENDPOINTS } from '../core/constants';

const logger = createLogger('NostrAuthService');

declare global {
    interface Window {
        nostr?: {
            getPublicKey(): Promise<string>;
            signEvent(event: any): Promise<any>;
        };
    }
}

/**
 * Represents a Nostr user with their access rights
 */
export interface NostrUser {
    pubkey: string;
    isPowerUser: boolean;
    features: string[];
}

/**
 * Result of an authentication attempt
 */
export interface AuthResult {
    authenticated: boolean;
    user?: NostrUser;
    error?: string;
}

/**
 * Server authentication response type
 */
interface AuthResponse {
    user: {
        pubkey: string;
        is_power_user: boolean;
        npub?: string;
    };
    token: string;
    features: string[];
    expires_at?: number;
    valid?: boolean;
    error?: string;
}

/**
 * Service for handling Nostr authentication and feature access
 */
export class NostrAuthService {
    private static instance: NostrAuthService;
    private currentUser: NostrUser | null = null;
    private eventEmitter: SettingsEventEmitter;
    private settingsPersistence: SettingsPersistenceService | null = null;
    private settingsStore: SettingsStore | null = null;

    private constructor() {
        this.eventEmitter = SettingsEventEmitter.getInstance();
        // No SettingsStore initialization here to avoid circular dependency
    }

    /**
     * Get the singleton instance of NostrAuthService
     */
    public static getInstance(): NostrAuthService {
        if (!NostrAuthService.instance) {
            NostrAuthService.instance = new NostrAuthService();
        }
        return NostrAuthService.instance;
    }

    /**
     * Initialize the auth service and check for existing session
     */
    public async initialize(): Promise<void> {
        logger.debug('Starting NostrAuthService initialization...');
        try {
            // Get SettingsStore instance but don't initialize it here
            this.settingsStore = SettingsStore.getInstance();

            // Wait for SettingsStore to be initialized if needed
            if (!this.settingsStore.isInitialized()) {
                logger.debug('Waiting for SettingsStore initialization...');
                await this.settingsStore.initialize();
            }

            // Get persistence service after SettingsStore is ready
            this.settingsPersistence = SettingsPersistenceService.getInstance();

            if (!this.settingsStore || !this.settingsPersistence) {
                throw new Error('Required services not initialized properly');
            }

            logger.debug('NostrAuthService initialized with settings store');
        } catch (error) {
            logger.error('Failed to initialize services:', createErrorMetadata(error));
            throw error;
        }

        const storedPubkey = localStorage.getItem('nostr_pubkey');
        if (storedPubkey) {
            // Wait for checkAuthStatus to complete
            await this.checkAuthStatus(storedPubkey);
            
            // Emit auth state change after initialization
            this.eventEmitter.emit(SettingsEventType.AUTH_STATE_CHANGED, {
                authState: {
                    isAuthenticated: this.currentUser !== null,
                    pubkey: this.currentUser?.pubkey
                }
            });
        }

        logger.debug('NostrAuthService initialization complete');
    }

    /**
     * Check if Alby extension is available
     */
    private checkAlbyAvailability(): boolean {
        return typeof window !== 'undefined' && 'nostr' in window;
    }

    /**
     * Create a Nostr event for authentication
     */
    private async createAuthEvent(pubkey: string): Promise<any> {
        const createdAt = Math.floor(Date.now() / 1000);
        const tags = [
            ['domain', window.location.hostname],
            ['challenge', Date.now().toString()]
        ];

        // Create event with required fields
        const event = {
            kind: 27235,
            created_at: createdAt,
            tags,
            content: `Authenticate with ${window.location.hostname} at ${new Date().toISOString()}`,
            pubkey,
        };

        // Log the event for debugging
        logger.debug('Creating auth event:', createDataMetadata({
            kind: event.kind,
            created_at: event.created_at,
            tags: event.tags,
            content: event.content,
            pubkey: event.pubkey
        }));

        // Sign the event using the Alby extension
        const signedEvent = await window.nostr?.signEvent(event);
        if (!signedEvent) {
            throw new Error('Failed to sign authentication event');
        }
        
        logger.debug('Signed event:', createDataMetadata(signedEvent));
        return signedEvent;
    }

    /**
     * Attempt to authenticate with Nostr using Alby
     */
    public async login(): Promise<AuthResult> {
        try {
            // Check if Alby is available
            if (!this.checkAlbyAvailability()) {
                throw new Error('Alby extension not found. Please install Alby to use Nostr login.');
            }

            // Get public key from Alby
            const pubkey = await window.nostr?.getPublicKey();
            if (!pubkey) {
                throw new Error('Failed to get public key from Alby');
            }

            // Create and sign the authentication event
            const signedEvent = await this.createAuthEvent(pubkey);
            logger.debug('Sending auth request with event:', createDataMetadata(signedEvent));

            // Send authentication request to server
            const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH_NOSTR), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(signedEvent)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Server response:', createDataMetadata({
                    status: response.status,
                    body: errorText
                }));
                throw new Error(`Authentication failed (${response.status}): ${errorText}`);
            }

            const authData = await response.json() as AuthResponse;
            
            // More detailed logging to diagnose the issue
            logger.debug('Raw auth response data:', createDataMetadata({
                hasUser: !!authData.user,
                isPowerUserDefined: authData.user ? (typeof authData.user.is_power_user !== 'undefined') : false,
                isPowerUserType: authData.user ? typeof authData.user.is_power_user : 'undefined',
                hasToken: !!authData.token,
                hasFeatures: !!authData.features,
                responseKeys: Object.keys(authData)
            }));
            
            // Validate response data
            if (!authData) {
                throw new Error('Empty authentication response from server');
            }
            
            if (!authData.user) {
                throw new Error('Missing user data in authentication response');
            }
            
            if (typeof authData.user.is_power_user !== 'boolean') {
                // Fix the type if needed - sometimes JSON serialization can convert booleans to strings
                if (authData.user.is_power_user === 'true') {
                    authData.user.is_power_user = true;
                } else if (authData.user.is_power_user === 'false') {
                    authData.user.is_power_user = false;
                } else if (authData.user.is_power_user === '1' || authData.user.is_power_user === 1) {
                    authData.user.is_power_user = true;
                } else if (authData.user.is_power_user === '0' || authData.user.is_power_user === 0) {
                    authData.user.is_power_user = false;
                } else if (authData.user.is_power_user === null || authData.user.is_power_user === undefined) {
                    // Default to false if the value is null or undefined
                    authData.user.is_power_user = false;
                    logger.warn('Power user status was null or undefined, defaulting to false');
                } else {
                    // Instead of failing, log the issue and default to false
                    logger.error(`Unexpected power user status value: ${typeof authData.user.is_power_user} - ${JSON.stringify(authData.user.is_power_user)}`);
                    authData.user.is_power_user = false;
                }
            }
            
            if (!authData.token) {
                throw new Error('Missing token in authentication response');
            }

            if (!Array.isArray(authData.features)) {
                // If features is missing or not an array, initialize it as an empty array
                authData.features = [];
                logger.warn('Features missing in auth response, using empty array');
            }

            // Check if the response has a valid format structure overall
            if (!this.isValidAuthResponse(authData)) {
                logger.error('Invalid authentication response format:', createDataMetadata(authData));
                throw new Error('Invalid authentication response structure from server');
            }

            // Log successful auth data for debugging
            logger.debug('Auth successful:', createDataMetadata({
                pubkey: authData.user.pubkey,
                isPowerUser: authData.user.is_power_user,
                features: authData.features
            }));

            this.currentUser = {
                pubkey: authData.user.pubkey,
                isPowerUser: authData.user.is_power_user,
                features: authData.features || []
            };

            localStorage.setItem('nostr_pubkey', pubkey);
            localStorage.setItem('nostr_token', authData.token);
            
            // Update both services
            if (!this.settingsPersistence || !this.settingsStore) {
                throw new Error('Services not initialized. Call initialize() first.');
            }

            this.settingsPersistence?.setCurrentUser(pubkey, authData.user.is_power_user);
            
            // Update settings store and load server settings
            this.settingsStore.setUserLoggedIn(true);
            const settingsLoaded = await this.settingsStore.loadServerSettings();
            
            // Update settings manager with server settings
            await settingsManager.updateSettingsFromServer();
            
            // Force refresh of visualization with new settings
            try {
                const visualizationController = VisualizationController.getInstance();
                const currentSettings = this.settingsStore.get('') as Settings;
                logger.info('Refreshing visualization with server settings after login');
                visualizationController.refreshSettings(currentSettings);
            } catch (error) {
                logger.warn('Failed to refresh visualization settings:', createErrorMetadata(error));
            }
            
            if (!settingsLoaded) {
                logger.warn('Failed to load server settings after login, using defaults');
            } else {
                logger.info('Successfully loaded server settings after login');
            }
            
            this.eventEmitter.emit(SettingsEventType.AUTH_STATE_CHANGED, {
                authState: {
                    isAuthenticated: true,
                    pubkey
                }
            });

            return {
                authenticated: true,
                user: this.currentUser
            };
        } catch (error) {
            logger.error('Login failed:', createErrorMetadata(error));
            return {
                authenticated: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            } as AuthResult;
        }
    }

    /**
     * Validate the authentication response structure
     */
    private isValidAuthResponse(response: any): boolean {
        try {
            // Verify core required structure for a valid auth response
            if (!response || typeof response !== 'object') return false;
            
            // Check if we have the required fields
            const hasRequiredFields = 
                response.user && 
                typeof response.user === 'object' &&
                typeof response.user.pubkey === 'string' &&
                (
                    typeof response.user.is_power_user === 'boolean' || 
                    // Allow these variants that we can convert
                    response.user.is_power_user === 'true' ||
                    response.user.is_power_user === 'false' ||
                    response.user.is_power_user === '1' ||
                    response.user.is_power_user === '0' ||
                    response.user.is_power_user === 1 ||
                    response.user.is_power_user === 0 ||
                    response.user.is_power_user === null ||
                    response.user.is_power_user === undefined
                ) &&
                typeof response.token === 'string';
            
            if (!hasRequiredFields) return false;
            
            // Features should be an array if present
            if (response.features !== undefined && !Array.isArray(response.features)) {
                return false;
            }
            
            return true;
        } catch (error) {
            logger.error('Error validating auth response:', createErrorMetadata(error));
            return false;
        }
    }

    /**
     * Log out the current user
     */
    public async logout(): Promise<void> {
        const currentPubkey = this.currentUser?.pubkey;
        const token = localStorage.getItem('nostr_token');
        const wasLoggedIn = this.isAuthenticated();
        
        if (!this.settingsPersistence || !this.settingsStore) {
            throw new Error('Services not initialized. Call initialize() first.');
        }

        if (currentPubkey && token) {
            try {
                await fetch(buildApiUrl(API_ENDPOINTS.AUTH_NOSTR), {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        pubkey: currentPubkey,
                        token
                    }),
                });
            } catch (error) {
                logger.error('Logout request failed:', createErrorMetadata(error));
            }
        }

        localStorage.removeItem('nostr_pubkey');
        localStorage.removeItem('nostr_token');
        this.currentUser = null;
        
        // Update settings store login status
        this.settingsStore.setUserLoggedIn(false);
        
        this.settingsPersistence?.setCurrentUser(null, false);
        this.eventEmitter.emit(SettingsEventType.AUTH_STATE_CHANGED, {
            authState: {
                isAuthenticated: false,
                pubkey: undefined
            }
        });

        // If user was using server settings, revert to local settings
        if (wasLoggedIn) {
            await this.settingsPersistence?.loadSettings();
            await this.settingsStore?.initialize(); // Reinitialize UI store
        }
    }

    /**
     * Get the current authenticated user
     */
    public getCurrentUser(): NostrUser | null {
        return this.currentUser;
    }

    /**
     * Check if the current user is authenticated
     */
    public isAuthenticated(): boolean {
        return this.currentUser !== null;
    }

    /**
     * Check if the current user is a power user
     */
    public isPowerUser(): boolean {
        return this.currentUser?.isPowerUser || false;
    }

    /**
     * Check if the current user has access to a specific feature
     */
    public hasFeatureAccess(feature: string): boolean {
        return this.currentUser?.features.includes(feature) || false;
    }

    /**
     * Check authentication status with the server
     */
    private async checkAuthStatus(pubkey: string): Promise<void> {
        const token = localStorage.getItem('nostr_token');
        if (!token) {
            // No token, so logout
            await this.logout();
            return;
        }

        try {
            const response = await fetch(buildApiUrl(API_ENDPOINTS.AUTH_NOSTR_VERIFY), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    pubkey,
                    token
                })
            });

            if (!response.ok) {
                throw new Error('Authentication check failed');
            }

            const verifyData = await response.json() as Partial<AuthResponse>;

            // Log the verification response for debugging
            logger.debug('Auth verification response:', createDataMetadata(verifyData));
            
            // Validate verify response data
            if (!verifyData || typeof verifyData.valid !== 'boolean') {
                throw new Error('Invalid verification response from server');
            }

            if (!verifyData.valid) {
                logger.error('Invalid session from server:', createDataMetadata(verifyData));
                throw new Error('Invalid session');
            }

            logger.debug('Auth check successful:', createDataMetadata({
                pubkey,
                isPowerUser: verifyData.user?.is_power_user
            }));

            // If user data is missing, log warning and logout
            if (!verifyData.user) {
                logger.warn('Valid verification but no user data provided');
                await this.logout();
                return;
            }

            if (!this.settingsPersistence || !this.settingsStore) {
                throw new Error('Services not initialized. Call initialize() first.');
            }

            // Set currentUser before emitting event
            this.currentUser = {
                pubkey,
                isPowerUser: verifyData.user.is_power_user,
                features: verifyData.features || []
            };
            
            // Update persistence service with verified user
            this.settingsPersistence?.setCurrentUser(pubkey, verifyData.user.is_power_user);
            
            // Load server settings since user is authenticated
            this.settingsStore.setUserLoggedIn(true);
            const settingsLoaded = await this.settingsStore.loadServerSettings();
            
            // Update settings manager with server settings
            settingsManager.updateSettingsFromServer();

            // Force refresh of visualization with new settings
            try {
                const visualizationController = VisualizationController.getInstance();
                const currentSettings = this.settingsStore.get('') as Settings;
                logger.info('Refreshing visualization with server settings after auth check');
                visualizationController.refreshSettings(currentSettings);
            } catch (error) {
                logger.warn('Failed to refresh visualization settings:', createErrorMetadata(error));
            }
            
            if (!settingsLoaded) {
                logger.warn('Failed to load server settings after auth check, using defaults');
            } else {
                logger.info('Successfully loaded server settings after auth check');
            }
        } catch (error) {
            logger.error('Auth check failed:', createErrorMetadata(error));
            await this.logout();
        }
    }

    /**
     * Subscribe to authentication state changes
     */
    public onAuthStateChanged(callback: (state: { authenticated: boolean; user?: NostrUser }) => void): () => void {
        return this.eventEmitter.on(SettingsEventType.AUTH_STATE_CHANGED, (data) => {
            callback({
                authenticated: data.authState?.isAuthenticated || false,
                user: this.currentUser || undefined
            });
        });
    }
}

// Export singleton instance
export const nostrAuth = NostrAuthService.getInstance();