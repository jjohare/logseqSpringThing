import { nostrAuth } from './NostrAuthService';
import { createLogger, createErrorMetadata } from '../core/logger';

const logger = createLogger('AuthUIHandler');

export class AuthUIHandler {
    private static instance: AuthUIHandler | null = null;
    private loginButton: HTMLButtonElement | null = null;
    private userInfo: HTMLElement | null = null;
    private userRole: HTMLElement | null = null;
    private userPubkey: HTMLElement | null = null;
    private authError: HTMLElement | null = null;

    private constructor() {
        this.initializeElements();
        this.setupAuthStateListener();
    }

    public static getInstance(): AuthUIHandler {
        if (!AuthUIHandler.instance) {
            AuthUIHandler.instance = new AuthUIHandler();
        }
        return AuthUIHandler.instance;
    }

    private initializeElements() {
        this.loginButton = document.getElementById('login-button') as HTMLButtonElement;
        this.userInfo = document.querySelector('.user-info') as HTMLElement;
        this.userRole = document.getElementById('user-role');
        this.userPubkey = document.getElementById('user-pubkey');
        this.authError = document.getElementById('auth-error');

        if (!this.loginButton || !this.userInfo || !this.userRole || !this.userPubkey || !this.authError) {
            logger.error('Auth UI elements not found');
            return;
        }
    }

    private setupAuthStateListener() {
        nostrAuth.onAuthStateChanged((state) => {
            if (!this.loginButton || !this.userInfo || !this.userRole || !this.userPubkey || !this.authError) {
                return;
            }

            if (state.authenticated && state.user) {
                this.handleAuthenticatedState(state.user);
            } else {
                this.handleUnauthenticatedState();
            }
        });
    }

    private handleAuthenticatedState(user: { isPowerUser: boolean; pubkey: string }) {
        if (!this.loginButton || !this.userInfo || !this.userRole || !this.userPubkey || !this.authError) {
            return;
        }

        this.loginButton.textContent = 'Logout';
        this.loginButton.onclick = async () => {
            try {
                this.loginButton!.disabled = true;
                await nostrAuth.logout();
            } catch (error) {
                logger.error('Logout failed:', createErrorMetadata(error));
                this.authError!.textContent = 'Logout failed. Please try again.';
                this.authError!.classList.add('visible');
            } finally {
                this.loginButton!.disabled = false;
            }
        };

        this.userInfo.classList.remove('hidden');
        this.userRole.textContent = user.isPowerUser ? 'Power User' : 'Authenticated User';
        this.userPubkey.textContent = `${user.pubkey.slice(0, 8)}...${user.pubkey.slice(-8)}`;
        this.authError.classList.remove('visible');
    }

    private handleUnauthenticatedState() {
        if (!this.loginButton || !this.userInfo || !this.userRole || !this.userPubkey || !this.authError) {
            return;
        }

        this.loginButton.textContent = 'Login with Nostr';
        this.loginButton.onclick = async () => {
            try {
                this.loginButton!.disabled = true;
                this.authError!.classList.remove('visible');
                const result = await nostrAuth.login();
                if (!result.authenticated) {
                    throw new Error(result.error || 'Login failed');
                }
            } catch (error) {
                logger.error('Login failed:', createErrorMetadata(error));
                this.authError!.textContent = error instanceof Error ? error.message : 'Login failed';
                this.authError!.classList.add('visible');
            } finally {
                this.loginButton!.disabled = false;
            }
        };

        this.userInfo.classList.add('hidden');
        this.userRole.textContent = '';
        this.userPubkey.textContent = '';
    }

    public dispose() {
        AuthUIHandler.instance = null;
    }
}

// Export singleton instance
export const authUIHandler = AuthUIHandler.getInstance();