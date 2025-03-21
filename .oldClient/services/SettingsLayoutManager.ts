import { createLogger, createErrorMetadata } from '../core/logger';
import { settingsEvents, SettingsEventType } from './SettingsEventEmitter';
import { SettingVisibility } from '../settings';

const logger = createLogger('SettingsLayoutManager');

export interface SectionLayout {
    id: string;
    isDetached: boolean;
    isCollapsed: boolean;
    isAdvanced: boolean;
    visibility: SettingVisibility;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    order: number;
}

export interface PanelLayout {
    sections: Record<string, SectionLayout>;
    version: string;
    timestamp: number;
    pubkey?: string;
}

export class SettingsLayoutManager {
    private static instance: SettingsLayoutManager | null = null;
    private readonly LOCAL_STORAGE_KEY = 'logseq_spring_panel_layout';
    private readonly LAYOUT_VERSION = '1.0.0';
    private currentLayout: PanelLayout;
    private currentPubkey: string | null = null;

    private constructor() {
        this.currentLayout = this.createDefaultLayout();
        this.initializeLayoutManager();
    }

    public static getInstance(): SettingsLayoutManager {
        if (!SettingsLayoutManager.instance) {
            SettingsLayoutManager.instance = new SettingsLayoutManager();
        }
        return SettingsLayoutManager.instance;
    }

    private initializeLayoutManager(): void {
        // Listen for section events
        settingsEvents.on(SettingsEventType.SECTION_DETACHED, ({ sectionId, position, size }) => {
            if (sectionId) {
                this.updateSectionLayout(sectionId, { isDetached: true, position, size });
            }
        });

        settingsEvents.on(SettingsEventType.SECTION_DOCKED, ({ sectionId }) => {
            if (sectionId) {
                this.updateSectionLayout(sectionId, { isDetached: false });
            }
        });

        settingsEvents.on(SettingsEventType.SECTION_MOVED, ({ sectionId, position }) => {
            if (sectionId && position) {
                this.updateSectionLayout(sectionId, { position });
            }
        });

        settingsEvents.on(SettingsEventType.SECTION_RESIZED, ({ sectionId, size }) => {
            if (sectionId && size) {
                this.updateSectionLayout(sectionId, { size });
            }
        });

        settingsEvents.on(SettingsEventType.SECTION_COLLAPSED, ({ sectionId }) => {
            if (sectionId) {
                this.updateSectionLayout(sectionId, { isCollapsed: true });
            }
        });

        settingsEvents.on(SettingsEventType.SECTION_EXPANDED, ({ sectionId }) => {
            if (sectionId) {
                this.updateSectionLayout(sectionId, { isCollapsed: false });
            }
        });

        // Listen for auth state changes
        settingsEvents.on(SettingsEventType.AUTH_STATE_CHANGED, ({ authState }) => {
            if (authState) {
                this.setCurrentPubkey(authState.isAuthenticated ? authState.pubkey ?? null : null);
            }
        });
    }

    private createDefaultLayout(): PanelLayout {
        return {
            sections: {
                visualization: {
                    id: 'visualization',
                    isDetached: false,
                    isCollapsed: false,
                    isAdvanced: false,
                    visibility: SettingVisibility.Basic,
                    order: 0
                },
                physics: {
                    id: 'physics',
                    isDetached: false,
                    isCollapsed: true,
                    isAdvanced: true,
                    visibility: SettingVisibility.Advanced,
                    order: 1
                },
                rendering: {
                    id: 'rendering',
                    isDetached: false,
                    isCollapsed: true,
                    isAdvanced: true,
                    visibility: SettingVisibility.Advanced,
                    order: 2
                },
                system: {
                    id: 'system',
                    isDetached: false,
                    isCollapsed: true,
                    isAdvanced: true,
                    visibility: SettingVisibility.Advanced,
                    order: 3
                },
                xr: {
                    id: 'xr',
                    isDetached: false,
                    isCollapsed: true,
                    isAdvanced: false,
                    visibility: SettingVisibility.Basic,
                    order: 4
                }
            },
            version: this.LAYOUT_VERSION,
            timestamp: Date.now()
        };
    }

    public setCurrentPubkey(pubkey: string | null): void {
        this.currentPubkey = pubkey;
        this.loadLayout();
    }

    private updateSectionLayout(sectionId: string, updates: Partial<SectionLayout>): void {
        const section = this.currentLayout.sections[sectionId];
        if (section) {
            Object.assign(section, updates);
            this.saveLayout();
            settingsEvents.emit(SettingsEventType.LAYOUT_CHANGED, {
                layout: this.currentLayout
            });
        }
    }

    public getSectionLayout(sectionId: string): SectionLayout | undefined {
        return this.currentLayout.sections[sectionId];
    }

    public getAllSectionLayouts(): Record<string, SectionLayout> {
        return { ...this.currentLayout.sections };
    }

    public async saveLayout(): Promise<void> {
        try {
            this.currentLayout.timestamp = Date.now();
            if (this.currentPubkey) {
                this.currentLayout.pubkey = this.currentPubkey;
            }

            localStorage.setItem(
                this.LOCAL_STORAGE_KEY,
                JSON.stringify(this.currentLayout)
            );

            settingsEvents.emit(SettingsEventType.LAYOUT_SAVED, {
                layout: this.currentLayout
            });

            logger.info('Layout saved successfully');
        } catch (error) {
            logger.error('Failed to save layout:', createErrorMetadata(error));
            throw error;
        }
    }

    public loadLayout(): void {
        try {
            const storedJson = localStorage.getItem(this.LOCAL_STORAGE_KEY);
            if (storedJson) {
                const stored: PanelLayout = JSON.parse(storedJson);

                // Version check
                if (stored.version !== this.LAYOUT_VERSION) {
                    logger.warn('Layout version mismatch, using defaults');
                    this.currentLayout = this.createDefaultLayout();
                    return;
                }

                // Pubkey check
                if (stored.pubkey && stored.pubkey !== this.currentPubkey) {
                    logger.warn('Layout pubkey mismatch, using defaults');
                    this.currentLayout = this.createDefaultLayout();
                    return;
                }

                this.currentLayout = stored;
                settingsEvents.emit(SettingsEventType.LAYOUT_LOADED, {
                    layout: this.currentLayout
                });
                logger.info('Layout loaded successfully');
            }
        } catch (error) {
            logger.error('Failed to load layout:', createErrorMetadata(error));
            this.currentLayout = this.createDefaultLayout();
        }
    }

    public resetLayout(): void {
        this.currentLayout = this.createDefaultLayout();
        this.saveLayout();
        settingsEvents.emit(SettingsEventType.LAYOUT_LOADED, {
            layout: this.currentLayout
        });
        logger.info('Layout reset to defaults');
    }

    public dispose(): void {
        SettingsLayoutManager.instance = null;
    }
}

// Create a singleton instance for easy access
export const layoutManager = SettingsLayoutManager.getInstance();