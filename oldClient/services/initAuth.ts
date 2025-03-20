import { nostrAuth } from './NostrAuthService';
import { authUIHandler } from './AuthUIHandler';
import { createLogger, createErrorMetadata } from '../core/logger';

const logger = createLogger('initAuth');

export async function initializeAuth(): Promise<void> {
    try {
        // Initialize Nostr auth service
        await nostrAuth.initialize();
        
        // AuthUIHandler will automatically set up the UI and event listeners
        // when instantiated
        authUIHandler;
        
        logger.info('Auth system initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize auth system:', createErrorMetadata(error));
        throw error;
    }
}