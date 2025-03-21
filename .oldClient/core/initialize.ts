import { initializeAuth } from '../services/initAuth';
import { platformManager } from '../platform/platformManager';
import { ModularControlPanel } from '../ui/ModularControlPanel';
import { SettingsStore } from '../state/SettingsStore';
import { defaultSettings } from '../state/defaultSettings';
import { LoggerConfig } from './logger';
import { Settings } from '../types/settings/base';
import { createLogger, createErrorMetadata } from './logger';
import { debugState } from './debugState';

const logger = createLogger('initialize');

export async function initializeApplication(): Promise<Settings> {
    if (debugState.isEnabled()) {
        logger.info('Starting application initialization...');
    }

    try {
        // Initialize ModularControlPanel and wait for settings to be ready
        const controlPanel = ModularControlPanel.getInstance();
        const settingsStore = SettingsStore.getInstance();

        // Wait for both control panel and settings store to be ready
        await Promise.all([
            new Promise<void>((resolve) => {
                if (controlPanel.isReady()) {
                    resolve();
                } else {
                    controlPanel.on('settings:ready', () => resolve());
                }
            }),
            settingsStore.initialize()
        ]);

        // Initialize auth system after settings store is ready
        await initializeAuth();

        // Initialize platform detection
        await platformManager.initialize(defaultSettings);

        // Get settings after everything is initialized
        const settings = settingsStore.get('') as Settings || defaultSettings;

        // Configure logging based on settings
        const debugEnabled = settingsStore.get('system.debug.enabled') as boolean;
        const logFullJson = settingsStore.get('system.debug.log_full_json') as boolean;
        LoggerConfig.setGlobalDebug(debugEnabled);
        LoggerConfig.setFullJson(logFullJson);

        // Subscribe to debug setting changes
        settingsStore.subscribe('system.debug.enabled', (_, value) => {
            LoggerConfig.setGlobalDebug(value as boolean);
        });
        settingsStore.subscribe('system.debug.log_full_json', (_, value) => {
            LoggerConfig.setFullJson(value as boolean);
        });

        logger.info('Core systems initialized successfully');
        return settings;
    } catch (error) {
        logger.error('Failed to initialize core systems:', createErrorMetadata(error));
        throw error;
    }
}