import { SettingsEventEmitter, SettingsEventType } from './SettingsEventEmitter';
import { SettingsPersistenceService } from './SettingsPersistenceService';
import { createLogger } from '../core/logger';
import { buildApiUrl } from '../core/api';
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
 * Service for handling Nostr authentication and feature access
 */
export class NostrAuthService {
    private static instance: NostrAuthService;
    private currentUser: NostrUser | null = null;
    private eventEmitter: SettingsEventEmitter;
    private settingsPersistence: SettingsPersistenceService;

    private constructor() {
        this.eventEmitter = SettingsEventEmitter.getInstance();
        this.settingsPersistence = SettingsPersistenceService.getInstance();
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

        const event = {
            kind: 27235,
            created_at: createdAt,
            tags,
            content: `Authenticate with ${window.location.hostname} at ${new Date().toISOString()}`,
            pubkey
        };

        // Sign the event using the Alby extension
        const signedEvent = await window.nostr?.signEvent(event);
        if (!signedEvent) {
            throw new Error('Failed to sign authentication event');
        }

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
                throw new Error(`Authentication failed: ${errorText}`);
            }

            const authData = await response.json();
            this.currentUser = {
                pubkey: authData.user.pubkey,
                isPowerUser: authData.user.is_power_user,
                features: authData.features
            };

            localStorage.setItem('nostr_pubkey', pubkey);
            localStorage.setItem('nostr_token', authData.token);
            this.settingsPersistence.setCurrentPubkey(pubkey);
            
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
            logger.error('Login failed:', error);
            return {
                authenticated: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Log out the current user
     */
    public async logout(): Promise<void> {
        const currentPubkey = this.currentUser?.pubkey;
        const token = localStorage.getItem('nostr_token');
        
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
                    })
                });
            } catch (error) {
                logger.error('Logout request failed:', error);
            }
        }

        localStorage.removeItem('nostr_pubkey');
        localStorage.removeItem('nostr_token');
        this.currentUser = null;
        this.settingsPersistence.setCurrentPubkey(null);
        
        this.eventEmitter.emit(SettingsEventType.AUTH_STATE_CHANGED, {
            authState: {
                isAuthenticated: false
            }
        });

        // If user was using server settings, revert to local settings
        if (currentPubkey) {
            await this.settingsPersistence.loadSettings();
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

            const verifyData = await response.json();
            if (!verifyData.valid) {
                throw new Error('Invalid session');
            }

            // Set currentUser before emitting event
            this.currentUser = {
                pubkey,
                isPowerUser: verifyData.is_power_user,
                features: verifyData.features
            };

            this.settingsPersistence.setCurrentPubkey(pubkey);
        } catch (error) {
            logger.error('Auth check failed:', error);
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