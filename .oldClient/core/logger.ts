import { Vector3 } from 'three';
import { debugState } from './debugState';

let debugEnabled = false;
let logFullJson = false;

export interface LogMetadata {
    position?: Vector3;
    velocity?: Vector3;
    component?: string;
    operation?: string;
    duration?: number;
    error?: Error | string | unknown;  // Allow various error types
    nodeId?: string | number;  // Allow both string and number IDs
    message?: string;  // For string messages
    status?: number;   // For HTTP status codes
    size?: number;
    data?: any;        // For arbitrary data objects
    stack?: string;    // For error stacks
    response?: any;    // For API responses
    [key: string]: any; // Allow for additional metadata
}

// Helper functions for creating metadata objects
export const createErrorMetadata = (error: unknown, additionalData?: Record<string, any>): LogMetadata => {
    const metadata: LogMetadata = {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...additionalData
    };
    return metadata;
};

export const createMessageMetadata = (message: string | number, additionalData?: Record<string, any>): LogMetadata => {
    const metadata: LogMetadata = {
        message: String(message),
        ...additionalData
    };
    return metadata;
};

export const createDataMetadata = (data: any, additionalData?: Record<string, any>): LogMetadata => {
    const metadata: LogMetadata = {
        data,
        ...additionalData
    };
    return metadata;
};

export interface Logger {
    debug: (message: string, metadata?: LogMetadata) => void;
    log: (message: string, metadata?: LogMetadata) => void;
    info: (message: string, metadata?: LogMetadata) => void;
    warn: (message: string, metadata?: LogMetadata) => void;
    error: (message: string, metadata?: LogMetadata) => void;
    physics: (message: string, metadata?: LogMetadata) => void;
    matrix: (message: string, metadata?: LogMetadata) => void;
    performance: (message: string, metadata?: LogMetadata) => void;
    node: (message: string, metadata?: LogMetadata) => void;
    shader: (message: string, metadata?: LogMetadata) => void;
}

const MAX_VECTOR_PRECISION = 4;
const MAX_DURATION_PRECISION = 2;

export function setDebugEnabled(enabled: boolean, fullJson: boolean = false): void {
    debugEnabled = enabled;
    logFullJson = fullJson;
}

export function createLogger(context: string): Logger {
    const prefix = `[${context}]`;
    
    const formatMetadata = (metadata?: LogMetadata): string => {
        if (!metadata) return '';

        const formattedMetadata: Record<string, any> = {};

        // Format Vector3 values with limited precision
        if (metadata.position) {
            formattedMetadata.position = {
                x: metadata.position.x.toFixed(MAX_VECTOR_PRECISION),
                y: metadata.position.y.toFixed(MAX_VECTOR_PRECISION),
                z: metadata.position.z.toFixed(MAX_VECTOR_PRECISION)
            };
        }

        if (metadata.velocity) {
            formattedMetadata.velocity = {
                x: metadata.velocity.x.toFixed(MAX_VECTOR_PRECISION),
                y: metadata.velocity.y.toFixed(MAX_VECTOR_PRECISION),
                z: metadata.velocity.z.toFixed(MAX_VECTOR_PRECISION)
            };
        }

        // Format duration with limited precision
        if (metadata.duration !== undefined) {
            formattedMetadata.duration = `${metadata.duration.toFixed(MAX_DURATION_PRECISION)}ms`;
        }

        // Handle error objects
        if (metadata.error instanceof Error) {
            formattedMetadata.error = {
                name: metadata.error.name,
                message: metadata.error.message,
                stack: metadata.error.stack
            };
        } else if (metadata.error !== undefined) {
            // Handle non-Error error types
            formattedMetadata.error = {
                message: String(metadata.error),
                type: typeof metadata.error,
                value: metadata.error
            };
        }

        // Copy remaining metadata
        Object.entries(metadata).forEach(([key, value]) => {
            if (!formattedMetadata[key] && value !== undefined) {
                formattedMetadata[key] = value;
            }
        });

        if (logFullJson) {
            return JSON.stringify(formattedMetadata, null, 2);
        }

        // Compact format for non-full JSON mode
        const metadataStr = JSON.stringify(formattedMetadata);
        return metadataStr.length > 2 ? ` ${metadataStr}` : '';
    };

    // Add timestamp to prefix
    const getPrefix = () => {
        const now = new Date();
        const timestamp = now.toISOString().split('T')[1].slice(0, -1);
        return `${timestamp} ${prefix}`;
    };
    
    return {
        debug: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled) {
                console.debug(getPrefix(), message, formatMetadata(metadata));
            }
        },
        log: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled) {
                console.log(getPrefix(), message, formatMetadata(metadata));
            }
        },
        info: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled) {
                console.info(getPrefix(), message, formatMetadata(metadata));
            }
        },
        warn: (message: string, metadata?: LogMetadata): void => {
            console.warn(getPrefix(), message, formatMetadata(metadata));
        },
        error: (message: string, metadata?: LogMetadata): void => {
            console.error(getPrefix(), message, formatMetadata(metadata));
        },
        physics: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled && debugState.isPhysicsDebugEnabled()) {
                console.debug(`${getPrefix()}[Physics]`, message, formatMetadata(metadata));
            }
        },
        matrix: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled && debugState.isMatrixDebugEnabled()) {
                console.debug(`${getPrefix()}[Matrix]`, message, formatMetadata(metadata));
            }
        },
        performance: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled && debugState.isPerformanceDebugEnabled()) {
                console.debug(`${getPrefix()}[Performance]`, message, formatMetadata(metadata));
            }
        },
        node: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled && debugState.isNodeDebugEnabled()) {
                console.debug(`${getPrefix()}[Node]`, message, formatMetadata(metadata));
            }
        },
        shader: (message: string, metadata?: LogMetadata): void => {
            if (debugEnabled && debugState.isShaderDebugEnabled()) {
                console.debug(`${getPrefix()}[Shader]`, message, formatMetadata(metadata));
            }
        }
    };
}

// Create and export a global logger configuration
export const LoggerConfig = {
    setGlobalDebug(enabled: boolean) {
        debugEnabled = enabled;
        if (enabled) {
            console.log(`[Logger] Debug logging enabled`);
        }
    },
    setFullJson(enabled: boolean) {
        logFullJson = enabled;
    }
};

// Create core logger instance
export const logger = createLogger('core');
