let debugEnabled = false;
let logFullJson = false;

export interface Logger {
    debug: (...args: any[]) => void;
    log: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
}

export function setDebugEnabled(enabled: boolean, fullJson: boolean = false): void {
    debugEnabled = enabled;
    logFullJson = fullJson;
}

export function createLogger(context: string): Logger {
    const prefix = `[${context}]`;
    
    const formatArgs = (args: any[]): any[] => {
        if (logFullJson) {
            return args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
            );
        }
        return args;
    };

    // Add timestamp to prefix
    const getPrefix = () => {
        const now = new Date();
        const timestamp = now.toISOString().split('T')[1].slice(0, -1);
        return `${timestamp} ${prefix}`;
    };
    
    return {
        debug: (...args: any[]): void => {
            if (debugEnabled) {
                console.debug(getPrefix(), ...formatArgs(args));
            }
        },
        log: (...args: any[]): void => {
            if (debugEnabled) {
                console.log(getPrefix(), ...formatArgs(args));
            }
        },
        info: (...args: any[]): void => {
            if (debugEnabled) {
                console.info(getPrefix(), ...formatArgs(args));
            }
        },
        warn: (...args: any[]): void => {
            console.warn(getPrefix(), ...formatArgs(args));
        },
        error: (...args: any[]): void => {
            console.error(getPrefix(), ...formatArgs(args));
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
