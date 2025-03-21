import { createLogger, createErrorMetadata } from '../core/logger';
import { settingsEvents, SettingsEventType } from './SettingsEventEmitter';
import { VisualizationController } from '../rendering/VisualizationController';
import { Settings } from '../types/settings/base';

const logger = createLogger('SettingsPreviewManager');

type VisualizationCategory = 'visualization' | 'physics' | 'rendering';

export interface PreviewState {
    originalSettings: Partial<Settings>;
    previewSettings: Partial<Settings>;
    isPreviewActive: boolean;
    previewTimeout: number | null;
}

export class SettingsPreviewManager {
    private static instance: SettingsPreviewManager | null = null;
    private visualizationController: VisualizationController;
    private readonly UPDATE_DELAY = 16; // ~60fps
    private previewStates: Map<VisualizationCategory, PreviewState>;

    private constructor() {
        this.visualizationController = VisualizationController.getInstance();
        this.previewStates = new Map();
        this.initializePreviewManager();
    }

    public static getInstance(): SettingsPreviewManager {
        if (!SettingsPreviewManager.instance) {
            SettingsPreviewManager.instance = new SettingsPreviewManager();
        }
        return SettingsPreviewManager.instance;
    }

    private initializePreviewManager(): void {
        // Listen for settings changes
        settingsEvents.on(SettingsEventType.SETTINGS_CHANGED, ({ path, value }) => {
            if (path) {
                this.handleSettingChange(path, value);
            }
        });

        // Listen for preview reset events
        settingsEvents.on(SettingsEventType.PREVIEW_RESET, ({ path }) => {
            if (path) {
                const category = this.getCategoryFromPath(path);
                if (category) {
                    this.resetPreview(category);
                }
            }
        });
    }

    private getCategoryFromPath(path: string): VisualizationCategory | null {
        const category = path.split('.')[0];
        if (['visualization', 'physics', 'rendering'].includes(category)) {
            return category as VisualizationCategory;
        }
        return null;
    }

    private handleSettingChange(path: string, value: any): void {
        const category = this.getCategoryFromPath(path);
        if (!category) return;

        let previewState = this.previewStates.get(category);

        if (!previewState) {
            previewState = {
                originalSettings: {},
                previewSettings: {},
                isPreviewActive: false,
                previewTimeout: null
            };
            this.previewStates.set(category, previewState);
        }

        // Store original value if not already stored
        if (!previewState.isPreviewActive) {
            previewState.originalSettings = this.visualizationController.getSettings(category);
            previewState.isPreviewActive = true;
        }

        // Update preview settings
        this.updatePreviewSettings(previewState, path, value);

        // Debounce preview update
        if (previewState.previewTimeout !== null) {
            window.clearTimeout(previewState.previewTimeout);
        }

        previewState.previewTimeout = window.setTimeout(() => {
            this.applyPreview(category, previewState);
            previewState.previewTimeout = null;
        }, this.UPDATE_DELAY);
    }

    private updatePreviewSettings(state: PreviewState, path: string, value: any): void {
        const parts = path.split('.');
        let current = state.previewSettings as any;

        // Create nested structure
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }

        // Set the value
        current[parts[parts.length - 1]] = value;
    }

    private applyPreview(category: VisualizationCategory, state: PreviewState): void {
        try {
            // Apply preview settings to visualization
            this.visualizationController.updateSettings(category, state.previewSettings);

            // Emit preview updated event
            settingsEvents.emit(SettingsEventType.PREVIEW_UPDATED, {
                path: category,
                value: state.previewSettings
            });

            logger.debug(`Preview applied for ${category}`);
        } catch (error) {
            logger.error(`Failed to apply preview for ${category}:`, createErrorMetadata(error));
            this.resetPreview(category);
        }
    }

    public resetPreview(category: VisualizationCategory): void {
        const state = this.previewStates.get(category);
        if (state?.isPreviewActive) {
            try {
                // Clear any pending preview
                if (state.previewTimeout !== null) {
                    window.clearTimeout(state.previewTimeout);
                    state.previewTimeout = null;
                }

                // Restore original settings
                this.visualizationController.updateSettings(category, state.originalSettings);

                // Reset state
                state.previewSettings = {};
                state.isPreviewActive = false;

                logger.debug(`Preview reset for ${category}`);
            } catch (error) {
                logger.error(`Failed to reset preview for ${category}:`, createErrorMetadata(error));
            }
        }
    }

    public resetAllPreviews(): void {
        ['visualization', 'physics', 'rendering'].forEach(category => {
            this.resetPreview(category as VisualizationCategory);
        });
    }

    public isPreviewActive(category: VisualizationCategory): boolean {
        const state = this.previewStates.get(category);
        return state?.isPreviewActive ?? false;
    }

    public getPreviewSettings(category: VisualizationCategory): Partial<Settings> | null {
        const state = this.previewStates.get(category);
        return state?.isPreviewActive ? state.previewSettings : null;
    }

    public dispose(): void {
        this.resetAllPreviews();
        this.previewStates.clear();
        SettingsPreviewManager.instance = null;
    }
}

// Create a singleton instance for easy access
export const previewManager = SettingsPreviewManager.getInstance();