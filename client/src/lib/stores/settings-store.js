import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { defaultSettings } from '../config/default-settings';
import { createLogger, createErrorMetadata } from '../utils/logger';
import { debugState } from '../utils/debug-state';
const logger = createLogger('SettingsStore');
export const useSettingsStore = create()(persist((set, get) => ({
    settings: defaultSettings,
    initialized: false,
    authenticated: false,
    user: null,
    subscribers: new Map(),
    initialize: async () => {
        try {
            if (debugState.isEnabled()) {
                logger.info('Initializing settings');
            }
            // Load settings from localStorage via zustand persist
            const currentSettings = get().settings;
            // Fetch settings from server if available
            try {
                const response = await fetch('/api/settings');
                if (response.ok) {
                    const serverSettings = await response.json();
                    // Merge server settings with defaults and current settings
                    const mergedSettings = {
                        ...defaultSettings,
                        ...currentSettings,
                        ...serverSettings
                    };
                    set({
                        settings: mergedSettings,
                        initialized: true
                    });
                    if (debugState.isEnabled()) {
                        logger.info('Settings loaded from server and merged');
                    }
                    return mergedSettings;
                }
            }
            catch (error) {
                logger.warn('Failed to fetch settings from server:', createErrorMetadata(error));
                // Continue with local settings if server fetch fails
            }
            // Mark as initialized
            set({ initialized: true });
            if (debugState.isEnabled()) {
                logger.info('Settings initialized from local storage');
            }
            return currentSettings;
        }
        catch (error) {
            logger.error('Failed to initialize settings:', createErrorMetadata(error));
            // Fall back to default settings
            set({
                settings: defaultSettings,
                initialized: true
            });
            return defaultSettings;
        }
    },
    setAuthenticated: (authenticated) => set({ authenticated }),
    setUser: (user) => set({ user }),
    get: (path) => {
        const settings = get().settings;
        if (!path || path === '') {
            return settings;
        }
        // Navigate the settings object using the path
        let current = settings;
        const pathParts = path.split('.');
        for (const part of pathParts) {
            if (current === undefined || current === null) {
                return undefined;
            }
            current = current[part];
        }
        return current;
    },
    set: (path, value) => {
        set(state => {
            // If setting the entire object
            if (!path || path === '') {
                return { settings: value };
            }
            // Create a deep copy of the settings object
            const newSettings = JSON.parse(JSON.stringify(state.settings));
            // Navigate to the correct location and update
            const pathParts = path.split('.');
            let current = newSettings;
            // Navigate to the parent of the setting we want to update
            for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (current[part] === undefined || current[part] === null) {
                    // Create the path if it doesn't exist
                    current[part] = {};
                }
                current = current[part];
            }
            // Update the value
            const finalPart = pathParts[pathParts.length - 1];
            current[finalPart] = value;
            // Return the updated settings
            return { settings: newSettings };
        });
        // Notify subscribers
        const notifySubscribers = async () => {
            const state = get();
            // Build a list of paths to notify
            // e.g. for path 'visualization.bloom.enabled':
            // '', 'visualization', 'visualization.bloom', 'visualization.bloom.enabled'
            const pathsToNotify = [''];
            const pathParts = path.split('.');
            let currentPath = '';
            for (const part of pathParts) {
                currentPath = currentPath ? `${currentPath}.${part}` : part;
                pathsToNotify.push(currentPath);
            }
            // Notify subscribers for each path
            for (const notifyPath of pathsToNotify) {
                const callbacks = state.subscribers.get(notifyPath);
                if (callbacks) {
                    // Convert Set to Array to avoid TypeScript iteration issues
                    Array.from(callbacks).forEach(callback => {
                        try {
                            callback();
                        }
                        catch (error) {
                            logger.error(`Error in settings subscriber for path ${notifyPath}:`, createErrorMetadata(error));
                        }
                    });
                }
            }
            // Save to server if appropriate
            if (state.initialized && state.settings.system?.persistSettings !== false) {
                try {
                    const response = await fetch('/api/settings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(state.settings)
                    });
                    if (!response.ok) {
                        throw new Error(`Failed to save settings: ${response.status} ${response.statusText}`);
                    }
                    if (debugState.isEnabled()) {
                        logger.info('Settings saved to server');
                    }
                }
                catch (error) {
                    logger.error('Failed to save settings to server:', createErrorMetadata(error));
                }
            }
        };
        // Debounce saving settings
        if (typeof window !== 'undefined') {
            if (window.settingsSaveTimeout) {
                clearTimeout(window.settingsSaveTimeout);
            }
            window.settingsSaveTimeout = setTimeout(notifySubscribers, 300);
        }
        else {
            // If running server-side, notify immediately
            notifySubscribers();
        }
    },
    subscribe: (path, callback, immediate = true) => {
        set(state => {
            const subscribers = new Map(state.subscribers);
            if (!subscribers.has(path)) {
                subscribers.set(path, new Set());
            }
            subscribers.get(path).add(callback);
            return { subscribers };
        });
        // Call callback immediately if requested and initialized
        if (immediate && get().initialized) {
            callback();
        }
        // Return unsubscribe function
        return () => get().unsubscribe(path, callback);
    },
    unsubscribe: (path, callback) => {
        set(state => {
            const subscribers = new Map(state.subscribers);
            if (subscribers.has(path)) {
                const callbacks = subscribers.get(path);
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    subscribers.delete(path);
                }
            }
            return { subscribers };
        });
    }
}), {
    name: 'graph-viz-settings',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
        settings: state.settings,
        authenticated: state.authenticated,
        user: state.user
    })
}));
