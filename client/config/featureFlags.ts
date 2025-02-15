import { createLogger } from '../core/logger';

const logger = createLogger('FeatureFlags');

/**
 * Feature flag configuration interface
 */
export interface FeatureFlags {
    enableLOD: boolean;
}

/**
 * Default feature flag values
 */
const defaultFlags: FeatureFlags = {
    enableLOD: true,  // Enable Level of Detail system
};

/**
 * Feature flag manager class
 */
export class FeatureFlagManager {
    private static instance: FeatureFlagManager;
    private flags: FeatureFlags;
    private listeners: Set<(flags: FeatureFlags) => void>;

    private constructor() {
        this.flags = { ...defaultFlags };
        this.listeners = new Set();
        
        // Load flags from localStorage if available
        if (typeof window !== 'undefined' && window.localStorage) {
            const savedFlags = localStorage.getItem('featureFlags');
            if (savedFlags) {
                try {
                    const parsed = JSON.parse(savedFlags);
                    this.flags = {
                        ...defaultFlags,
                        ...parsed
                    };
                    logger.info('Loaded feature flags from localStorage');
                } catch (error) {
                    logger.error('Failed to parse feature flags from localStorage:', error);
                }
            }
        }
    }

    public static getInstance(): FeatureFlagManager {
        if (!FeatureFlagManager.instance) {
            FeatureFlagManager.instance = new FeatureFlagManager();
        }
        return FeatureFlagManager.instance;
    }

    /**
     * Get current state of all feature flags
     */
    public getFlags(): FeatureFlags {
        return { ...this.flags };
    }

    /**
     * Check if a specific feature is enabled
     */
    public isEnabled(feature: keyof FeatureFlags): boolean {
        return this.flags[feature];
    }

    /**
     * Update feature flags
     */
    public updateFlags(updates: Partial<FeatureFlags>): void {
        const oldFlags = { ...this.flags };
        this.flags = {
            ...this.flags,
            ...updates
        };

        // Save to localStorage if available
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.setItem('featureFlags', JSON.stringify(this.flags));
            } catch (error) {
                logger.error('Failed to save feature flags to localStorage:', error);
            }
        }

        // Log changes
        Object.keys(updates).forEach(key => {
            const feature = key as keyof FeatureFlags;
            if (oldFlags[feature] !== this.flags[feature]) {
                logger.info(`Feature flag "${feature}" changed:`, {
                    from: oldFlags[feature],
                    to: this.flags[feature]
                });
            }
        });

        // Notify listeners
        this.notifyListeners();
    }

    /**
     * Subscribe to feature flag changes
     */
    public subscribe(callback: (flags: FeatureFlags) => void): () => void {
        this.listeners.add(callback);
        return () => {
            this.listeners.delete(callback);
        };
    }

    /**
     * Reset all flags to default values
     */
    public reset(): void {
        this.updateFlags(defaultFlags);
        logger.info('Reset all feature flags to defaults');
    }

    private notifyListeners(): void {
        const flags = this.getFlags();
        this.listeners.forEach(listener => {
            try {
                listener(flags);
            } catch (error) {
                logger.error('Error in feature flag listener:', error);
            }
        });
    }
}

// Export singleton instance
export const featureFlags = FeatureFlagManager.getInstance();