import { platformManager } from '../platform/platformManager';
import { XRSessionManager } from './xrSessionManager';
import { createLogger, createErrorMetadata, createMessageMetadata } from '../core/logger';
import { XRSessionState } from '../types/xr';

const logger = createLogger('XRInitializer');

export class XRInitializer {
    private static instance: XRInitializer | null = null;
    private xrButton: HTMLButtonElement;
    private xrSessionManager: XRSessionManager;
    private buttonDebounceTimeout: number | null = null;

    private constructor(xrSessionManager: XRSessionManager) {
        this.xrSessionManager = xrSessionManager;
        this.xrButton = document.getElementById('xr-button') as HTMLButtonElement;
        if (!this.xrButton) {
            throw new Error('XR button not found');
        }
        this.setupEventListeners();
        this.setupSessionStateListener();
    }

    public static getInstance(xrSessionManager: XRSessionManager): XRInitializer {
        if (!XRInitializer.instance) {
            XRInitializer.instance = new XRInitializer(xrSessionManager);
        }
        return XRInitializer.instance;
    }

    private isProcessingClick = false;
    private keyboardShortcutEnabled = !platformManager.isQuest(); // Disable for Quest

    private setupSessionStateListener(): void {
        // Listen for XR session state changes
        platformManager.on('xrsessionstatechange', (state: XRSessionState) => {
            logger.info('XR session state changed:', createMessageMetadata(state));
            
            // Update button state based on session state
            if (state === 'inactive') {
                this.xrButton.classList.remove('hidden');
                this.xrButton.disabled = false;
                this.xrButton.textContent = platformManager.isQuest() ? 'Enter AR' : 'Enter VR';
            } else {
                this.xrButton.disabled = state === 'cooldown';
                this.xrButton.textContent = state === 'active' ? 'Exit AR' : 'Please wait...';
            }
        });
    }

    private setupEventListeners(): void {
        // Button click handler with debounce
        this.xrButton.addEventListener('click', async () => {
            if (this.isProcessingClick) return;
            this.isProcessingClick = true;
            
            try {
                await this.onXRButtonClick();
            } finally {
                // Reset after a short delay to prevent rapid clicks
                setTimeout(() => {
                    this.isProcessingClick = false;
                }, 1500); // Increased debounce time
                
                // Update button state
                this.xrButton.disabled = true;
                this.xrButton.textContent = 'Please wait...';
            }
        });

        // Keyboard shortcut only for non-Quest devices
        if (this.keyboardShortcutEnabled) {
            document.addEventListener('keydown', (event) => {
                if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
                    this.onXRButtonClick();
                }
            });
        }

        // Update button visibility based on XR session state
        this.xrSessionManager.setSessionCallbacks(
            () => this.updateButtonForActiveSession(),      // onStart
            () => this.updateButtonForInactiveSession(),    // onEnd
            () => {}                                        // onFrame
        );

        // Initial button state
        this.updateButtonState();
    }

    private updateButtonForActiveSession(): void {
        this.xrButton.classList.remove('hidden');
        this.xrButton.disabled = false;
        this.xrButton.textContent = 'Exit AR';
    }

    private updateButtonForInactiveSession(): void {
        // Clear any existing timeout
        if (this.buttonDebounceTimeout !== null) {
            clearTimeout(this.buttonDebounceTimeout);
        }
        
        // Set button to disabled with "Please wait..." text during cooldown
        this.xrButton.disabled = platformManager.xrSessionState === 'cooldown';
    }

    private async updateButtonState(): Promise<void> {
        const isQuest = platformManager.isQuest();
        const xrSupported = platformManager.isXRSupported();

        if (!xrSupported) {
            this.xrButton.style.display = 'none';
            return;
        }

        if (isQuest) {
            this.xrButton.textContent = 'Enter AR';
            this.xrButton.disabled = platformManager.xrSessionState !== 'inactive';
            this.xrButton.classList.remove('hidden');
        } else {
            this.xrButton.textContent = 'Enter VR';
            this.xrButton.disabled = platformManager.xrSessionState !== 'inactive';
            this.xrButton.classList.remove('hidden');
        }
    }

    private async onXRButtonClick(): Promise<void> {
        try {
            if (this.xrSessionManager.isXRPresenting()) {
                // If we're already in a session, end it
                logger.info('Ending XR session');
                this.xrButton.disabled = true;
                this.xrButton.textContent = 'Exiting...';
                
                // End the session
                await this.xrSessionManager.endXRSession();
            } else {
                await this.xrSessionManager.initXRSession();
            }
        } catch (error) {
            logger.error('Failed to toggle XR session:', createErrorMetadata(error));
        }
    }

    public dispose(): void {
        // Clean up timeouts
        if (this.buttonDebounceTimeout !== null) {
            clearTimeout(this.buttonDebounceTimeout);
            this.buttonDebounceTimeout = null;
        }
        
        XRInitializer.instance = null;
    }
}