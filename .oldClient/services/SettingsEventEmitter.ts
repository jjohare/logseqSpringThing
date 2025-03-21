import { createLogger, createErrorMetadata, createDataMetadata } from '../core/logger';
import { Settings } from '../types/settings/base';
import { ValidationError } from '../types/settings/validation';

const logger = createLogger('SettingsEventEmitter');

export enum SettingsEventType {
    SETTINGS_LOADED = 'settings:loaded',
    SETTINGS_SAVED = 'settings:saved',
    SETTINGS_CHANGED = 'settings:changed',
    SETTINGS_ERROR = 'settings:error',
    SETTINGS_SYNCED = 'settings:synced',
    SETTINGS_VALIDATION_ERROR = 'settings:validation_error',
    SECTION_DETACHED = 'section:detached',
    SECTION_DOCKED = 'section:docked',
    SECTION_MOVED = 'section:moved',
    SECTION_RESIZED = 'section:resized',
    SECTION_COLLAPSED = 'section:collapsed',
    SECTION_EXPANDED = 'section:expanded',
    LAYOUT_CHANGED = 'layout:changed',
    LAYOUT_SAVED = 'layout:saved',
    LAYOUT_LOADED = 'layout:loaded',
    PREVIEW_UPDATED = 'preview:updated',
    PREVIEW_RESET = 'preview:reset',
    AUTH_STATE_CHANGED = 'auth:state_changed'
}

export interface EventData {
    type: SettingsEventType;
    path?: string;
    value?: any;
    error?: Error;
    validationErrors?: ValidationError[];
    sectionId?: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    layout?: any;
    settings?: Partial<Settings>;
    authState?: {
        isAuthenticated: boolean;
        pubkey?: string;
    };
}

export type EventCallback = (data: EventData) => void;

export class SettingsEventEmitter {
    private static instance: SettingsEventEmitter | null = null;
    private listeners: Map<SettingsEventType, Set<EventCallback>>;
    private lastEvents: Map<SettingsEventType, EventData>;

    private constructor() {
        this.listeners = new Map();
        this.lastEvents = new Map();
    }

    public static getInstance(): SettingsEventEmitter {
        if (!SettingsEventEmitter.instance) {
            SettingsEventEmitter.instance = new SettingsEventEmitter();
        }
        return SettingsEventEmitter.instance;
    }

    public on(event: SettingsEventType, callback: EventCallback): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        const callbacks = this.listeners.get(event)!;
        callbacks.add(callback);

        // Call with last event data if available
        const lastEvent = this.lastEvents.get(event);
        if (lastEvent) {
            try {
                callback(lastEvent);
            } catch (error) {
                logger.error(`Error in event listener for ${event}:`, createErrorMetadata(error));
            }
        }

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.listeners.delete(event);
                }
            }
        };
    }

    public emit(event: SettingsEventType, data: Omit<EventData, 'type'>): void {
        const eventData: EventData = { type: event, ...data };
        
        // Store last event data
        this.lastEvents.set(event, eventData);

        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(eventData);
                } catch (error) {
                    logger.error(`Error in event listener for ${event}:`, createErrorMetadata(error));
                }
            });
        }

        // Log significant events
        switch (event) {
            case SettingsEventType.SETTINGS_ERROR:
            case SettingsEventType.SETTINGS_VALIDATION_ERROR:
                logger.error(`${event}:`, createDataMetadata({
                    error: data.error,
                    validationErrors: data.validationErrors
                }));
                break;
            case SettingsEventType.SETTINGS_LOADED:
            case SettingsEventType.SETTINGS_SAVED:
            case SettingsEventType.SETTINGS_SYNCED:
                logger.info(`${event} completed`);
                break;
            case SettingsEventType.AUTH_STATE_CHANGED:
                logger.info('Authentication state changed:', createDataMetadata(data.authState));
                break;
        }
    }

    public getLastEvent(event: SettingsEventType): EventData | undefined {
        return this.lastEvents.get(event);
    }

    public clearLastEvent(event: SettingsEventType): void {
        this.lastEvents.delete(event);
    }

    public clearAllListeners(): void {
        this.listeners.clear();
    }

    public dispose(): void {
        this.clearAllListeners();
        this.lastEvents.clear();
        SettingsEventEmitter.instance = null;
    }
}

// Create a singleton instance for easy access
export const settingsEvents = SettingsEventEmitter.getInstance();