import { ModularControlPanel } from './ModularControlPanel';
import { createLogger, createErrorMetadata } from '../core/logger';
import './ModularControlPanel.css';

const logger = createLogger('UI');

// Initialize UI components
export async function initializeUI(): Promise<void> {
    try {
        logger.debug('Initializing UI components');
        
        // Initialize ModularControlPanel
        const controlPanel = ModularControlPanel.getInstance();
        
        // Wait for settings to be ready
        if (!controlPanel.isReady()) {
            await new Promise<void>((resolve) => {
                controlPanel.on('settings:ready', () => resolve());
            });
        }
        
        // Show panel by default
        controlPanel.show();
        
        logger.debug('ModularControlPanel initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize UI:', createErrorMetadata(error));
        throw error;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeUI().catch(error => {
            logger.error('Failed to initialize UI on DOMContentLoaded:', createErrorMetadata(error));
        });
    });
} else {
    initializeUI().catch(error => {
        logger.error('Failed to initialize UI:', createErrorMetadata(error));
    });
}

export { ModularControlPanel };
