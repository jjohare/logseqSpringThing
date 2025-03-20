import { create } from 'zustand';
import { createLogger } from '../utils/logger';
const logger = createLogger('PlatformManager');
export const usePlatformStore = create()((set, get) => ({
    // Default initial state
    platform: 'unknown',
    xrDeviceType: 'none',
    capabilities: {
        xrSupported: false,
        handTrackingSupported: false,
        arSupported: false,
        vrSupported: false,
        performanceTier: 'medium',
        maxTextureSize: 2048,
        hasTouchscreen: false,
        hasPointer: true,
        hasKeyboard: true,
        hasGamepad: false,
        memoryLimited: false
    },
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    isXRMode: false,
    xrSessionState: 'inactive',
    initialized: false,
    // Event listeners
    listeners: new Map(),
    initialize: async () => {
        logger.info('Initializing platform manager');
        // Detect platform first
        get().detectPlatform();
        // Check for XR support
        if (typeof navigator !== 'undefined' && navigator.xr) {
            // Test for VR support
            try {
                const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
                // Test for AR support (Oculus Quest)
                const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
                set(state => ({
                    capabilities: {
                        ...state.capabilities,
                        xrSupported: vrSupported || arSupported,
                        vrSupported,
                        arSupported
                    }
                }));
                logger.info('XR support detected', { vrSupported, arSupported });
            }
            catch (error) {
                logger.error('Error checking XR support:', error);
            }
        }
        // Check for hand tracking support
        if (typeof navigator !== 'undefined' && navigator.xr) {
            try {
                // Note: This might need further detection based on device
                const handTrackingSupported = get().isQuest();
                set(state => ({
                    capabilities: {
                        ...state.capabilities,
                        handTrackingSupported
                    }
                }));
            }
            catch (error) {
                logger.error('Error checking hand tracking support:', error);
            }
        }
        // Set up event listeners
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => {
                get().detectPlatform();
            });
        }
        set({ initialized: true });
        logger.info('Platform manager initialized', {
            platform: get().platform,
            xrDeviceType: get().xrDeviceType,
            capabilities: get().capabilities
        });
    },
    detectPlatform: () => {
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        let platform = 'unknown';
        let xrDeviceType = 'none';
        // Check for Quest
        if (userAgent.includes('Quest')) {
            if (userAgent.includes('Quest 3')) {
                platform = 'quest3';
            }
            else if (userAgent.includes('Quest 2')) {
                platform = 'quest2';
            }
            else {
                platform = 'quest';
            }
            xrDeviceType = 'quest';
        }
        // Check for Pico
        else if (userAgent.includes('Pico') || userAgent.includes('PICO')) {
            platform = 'pico';
            xrDeviceType = 'pico';
        }
        // Check for mobile
        else if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
            platform = 'mobile';
            xrDeviceType = 'mobile-xr';
        }
        // Default to desktop
        else {
            platform = 'desktop';
            xrDeviceType = 'desktop-xr';
        }
        // Determine performance tier based on platform
        let performanceTier = 'medium';
        let maxTextureSize = 2048;
        let memoryLimited = false;
        switch (platform) {
            case 'quest3':
                performanceTier = 'high';
                maxTextureSize = 4096;
                memoryLimited = true;
                break;
            case 'quest2':
                performanceTier = 'medium';
                maxTextureSize = 2048;
                memoryLimited = true;
                break;
            case 'quest':
                performanceTier = 'low';
                maxTextureSize = 2048;
                memoryLimited = true;
                break;
            case 'pico':
                performanceTier = 'medium';
                maxTextureSize = 2048;
                memoryLimited = true;
                break;
            case 'mobile':
                performanceTier = 'low';
                maxTextureSize = 2048;
                memoryLimited = true;
                break;
            case 'desktop':
                performanceTier = 'high';
                maxTextureSize = 8192;
                memoryLimited = false;
                break;
        }
        // Detect features
        const hasTouchscreen = typeof navigator !== 'undefined' &&
            ('maxTouchPoints' in navigator ? navigator.maxTouchPoints > 0 : 'ontouchstart' in window);
        // Update state with detected platform
        const prevPlatform = get().platform;
        set(state => ({
            platform,
            xrDeviceType,
            userAgent,
            capabilities: {
                ...state.capabilities,
                performanceTier,
                maxTextureSize,
                memoryLimited,
                hasTouchscreen,
                hasPointer: platform === 'desktop' || platform === 'mobile',
                hasKeyboard: platform === 'desktop',
                hasGamepad: platform.startsWith('quest') || platform === 'pico'
            }
        }));
        // Emit platform change event if changed
        if (prevPlatform !== platform) {
            get().dispatchEvent('platformchange', { platform });
        }
        return platform;
    },
    isQuest: () => {
        const platform = get().platform;
        return platform === 'quest' || platform === 'quest2' || platform === 'quest3';
    },
    isPico: () => {
        return get().platform === 'pico';
    },
    isDesktop: () => {
        return get().platform === 'desktop';
    },
    isMobile: () => {
        return get().platform === 'mobile';
    },
    isXRSupported: () => {
        return get().capabilities.xrSupported;
    },
    setXRMode: (enabled) => {
        const prev = get().isXRMode;
        if (prev !== enabled) {
            set({ isXRMode: enabled });
            get().dispatchEvent('xrmodechange', { enabled });
            logger.info(`XR mode ${enabled ? 'enabled' : 'disabled'}`);
        }
    },
    setXRSessionState: (state) => {
        const prev = get().xrSessionState;
        if (prev !== state) {
            set({ xrSessionState: state });
            get().dispatchEvent('xrsessionstatechange', { state });
            logger.info(`XR session state changed to ${state}`);
        }
    },
    // Internal helper to dispatch events
    dispatchEvent: (event, data) => {
        const listeners = get().listeners;
        if (!listeners.has(event))
            return;
        listeners.get(event)?.forEach(callback => {
            try {
                callback(data);
            }
            catch (error) {
                logger.error(`Error in ${event} listener:`, error);
            }
        });
    },
    // Event handling
    addEventListener: (event, callback) => {
        const listeners = get().listeners;
        if (!listeners.has(event)) {
            listeners.set(event, new Set());
        }
        listeners.get(event)?.add(callback);
        set({ listeners });
        // Immediately call the callback with current state for some events
        if (event === 'platformchange') {
            callback({ platform: get().platform });
        }
        else if (event === 'xrmodechange') {
            callback({ enabled: get().isXRMode });
        }
        else if (event === 'xrsessionstatechange') {
            callback({ state: get().xrSessionState });
        }
    },
    removeEventListener: (event, callback) => {
        const listeners = get().listeners;
        if (listeners.has(event)) {
            listeners.get(event)?.delete(callback);
            set({ listeners });
        }
    },
    removeAllListeners: (event) => {
        const listeners = get().listeners;
        if (event) {
            listeners.delete(event);
        }
        else {
            listeners.clear();
        }
        set({ listeners });
    }
}));
// Create a React hook to access the PlatformManager
export function usePlatform() {
    return usePlatformStore();
}
// Backwards compatibility adapter for old code
export class PlatformManager {
    constructor() { }
    static getInstance() {
        if (!PlatformManager.instance) {
            PlatformManager.instance = new PlatformManager();
        }
        return PlatformManager.instance;
    }
    get platform() {
        return usePlatformStore.getState().platform;
    }
    get isXRMode() {
        return usePlatformStore.getState().isXRMode;
    }
    get xrSessionState() {
        return usePlatformStore.getState().xrSessionState;
    }
    set xrSessionState(state) {
        usePlatformStore.getState().setXRSessionState(state);
    }
    async initialize(settings) {
        return usePlatformStore.getState().initialize();
    }
    isQuest() {
        return usePlatformStore.getState().isQuest();
    }
    isPico() {
        return usePlatformStore.getState().isPico();
    }
    isDesktop() {
        return usePlatformStore.getState().isDesktop();
    }
    isMobile() {
        return usePlatformStore.getState().isMobile();
    }
    isXRSupported() {
        return usePlatformStore.getState().isXRSupported();
    }
    setXRMode(enabled) {
        usePlatformStore.getState().setXRMode(enabled);
    }
    getCapabilities() {
        return usePlatformStore.getState().capabilities;
    }
    on(event, callback) {
        usePlatformStore.getState().addEventListener(event, callback);
    }
    off(event, callback) {
        usePlatformStore.getState().removeEventListener(event, callback);
    }
    removeAllListeners(event) {
        usePlatformStore.getState().removeAllListeners(event);
    }
}
// Export a singleton instance for backwards compatibility
export const platformManager = PlatformManager.getInstance();
