import { SettingsStore } from '../state/SettingsStore';

export interface DebugState {
    enabled: boolean;
    logFullJson: boolean;
    enableDataDebug: boolean;
    enableWebsocketDebug: boolean;
    logBinaryHeaders: boolean;
    // New debug categories for enhanced monitoring
    enablePhysicsDebug: boolean;
    enableNodeDebug: boolean;
    enableShaderDebug: boolean;
    enableMatrixDebug: boolean;
    enablePerformanceDebug: boolean;
    // Binary protocol status tracking
    binaryProtocolEnabled: boolean;
    binaryProtocolStatus: 'inactive' | 'pending' | 'active' | 'error' | 'failed';
}

class DebugStateManager {
    private static instance: DebugStateManager | null = null;
    private state: DebugState = {
        enabled: false,
        logFullJson: false,
        enableDataDebug: false,
        enableWebsocketDebug: false,
        logBinaryHeaders: false,
        enablePhysicsDebug: false,
        enableNodeDebug: false,
        enableShaderDebug: false,
        enableMatrixDebug: false,
        enablePerformanceDebug: false,
        binaryProtocolEnabled: false,
        binaryProtocolStatus: 'inactive'
    };

    private constructor() {}

    public static getInstance(): DebugStateManager {
        if (!DebugStateManager.instance) {
            DebugStateManager.instance = new DebugStateManager();
        }
        return DebugStateManager.instance;
    }

    public async initialize(): Promise<void> {
        const settingsStore = SettingsStore.getInstance();
        await settingsStore.initialize();

        // Load initial debug settings
        this.state = {
            enabled: settingsStore.get('system.debug.enabled') as boolean ?? false,
            logFullJson: settingsStore.get('system.debug.log_full_json') as boolean ?? false,
            enableDataDebug: settingsStore.get('system.debug.enable_data_debug') as boolean ?? false,
            enableWebsocketDebug: settingsStore.get('system.debug.enable_websocket_debug') as boolean ?? false,
            logBinaryHeaders: settingsStore.get('system.debug.log_binary_headers') as boolean ?? false,
            enablePhysicsDebug: settingsStore.get('system.debug.enable_physics_debug') as boolean ?? false,
            enableNodeDebug: settingsStore.get('system.debug.enable_node_debug') as boolean ?? false,
            enableShaderDebug: settingsStore.get('system.debug.enable_shader_debug') as boolean ?? false,
            enableMatrixDebug: settingsStore.get('system.debug.enable_matrix_debug') as boolean ?? false,
            enablePerformanceDebug: settingsStore.get('system.debug.enable_performance_debug') as boolean ?? false,
            binaryProtocolEnabled: false,
            binaryProtocolStatus: 'inactive' as 'inactive' | 'pending' | 'active' | 'error' | 'failed'
        };

        // Subscribe to debug setting changes
        settingsStore.subscribe('system.debug.enabled', (_, value) => {
            this.state.enabled = value as boolean;
            this.updateLoggerConfig();
        });

        settingsStore.subscribe('system.debug.log_full_json', (_, value) => {
            this.state.logFullJson = value as boolean;
            this.updateLoggerConfig();
        });

        settingsStore.subscribe('system.debug.enable_data_debug', (_, value) => {
            this.state.enableDataDebug = value as boolean;
        });

        settingsStore.subscribe('system.debug.enable_websocket_debug', (_, value) => {
            this.state.enableWebsocketDebug = value as boolean;
        });

        settingsStore.subscribe('system.debug.log_binary_headers', (_, value) => {
            this.state.logBinaryHeaders = value as boolean;
        });

        settingsStore.subscribe('system.debug.enable_physics_debug', (_, value) => {
            this.state.enablePhysicsDebug = value as boolean;
        });

        settingsStore.subscribe('system.debug.enable_node_debug', (_, value) => {
            this.state.enableNodeDebug = value as boolean;
        });

        settingsStore.subscribe('system.debug.enable_shader_debug', (_, value) => {
            this.state.enableShaderDebug = value as boolean;
        });

        settingsStore.subscribe('system.debug.enable_matrix_debug', (_, value) => {
            this.state.enableMatrixDebug = value as boolean;
        });

        settingsStore.subscribe('system.debug.enable_performance_debug', (_, value) => {
            this.state.enablePerformanceDebug = value as boolean;
        });

        // Log initial debug state if enabled
        if (this.state.enabled) {
            const { logger } = require('./logger');
            logger.debug('Debug state initialized', { ...this.state });
        }

        this.updateLoggerConfig();
    }

    private updateLoggerConfig(): void {
        const { LoggerConfig } = require('./logger');
        LoggerConfig.setGlobalDebug(this.state.enabled);
        LoggerConfig.setFullJson(this.state.logFullJson);
    }

    public isEnabled(): boolean {
        return this.state.enabled;
    }

    public isWebsocketDebugEnabled(): boolean {
        return this.state.enabled && this.state.enableWebsocketDebug;
    }

    public isDataDebugEnabled(): boolean {
        return this.state.enabled && this.state.enableDataDebug;
    }

    public shouldLogBinaryHeaders(): boolean {
        return this.state.enabled && this.state.logBinaryHeaders;
    }

    public isPhysicsDebugEnabled(): boolean {
        return this.state.enabled && this.state.enablePhysicsDebug;
    }

    public isNodeDebugEnabled(): boolean {
        return this.state.enabled && this.state.enableNodeDebug;
    }

    public isShaderDebugEnabled(): boolean {
        return this.state.enabled && this.state.enableShaderDebug;
    }

    public isMatrixDebugEnabled(): boolean {
        return this.state.enabled && this.state.enableMatrixDebug;
    }

    public isPerformanceDebugEnabled(): boolean {
        return this.state.enabled && this.state.enablePerformanceDebug;
    }

    public isBinaryProtocolEnabled(): boolean {
        return this.state.binaryProtocolEnabled;
    }

    public setBinaryProtocolEnabled(enabled: boolean): void {
        this.state.binaryProtocolEnabled = enabled;
        if (!enabled) {
            this.state.binaryProtocolStatus = 'inactive';
        }
    }

    public getBinaryProtocolStatus(): string {
        return this.state.binaryProtocolStatus;
    }

    public setBinaryProtocolStatus(status: 'inactive' | 'pending' | 'active' | 'error' | 'failed'): void {
        this.state.binaryProtocolStatus = status;
        
        // If we're setting to active or error, implicitly enable the protocol
        if (status === 'active' || status === 'pending') {
            this.state.binaryProtocolEnabled = true;
        }
        
        // Log status changes if debug is enabled
        if (this.state.enabled && this.state.enableWebsocketDebug) {
            const { logger } = require('./logger');
            logger.debug(`Binary protocol status changed to: ${status}`);
        }
    }

    public getState(): DebugState {
        return { ...this.state };
    }
}

export const debugState = DebugStateManager.getInstance();