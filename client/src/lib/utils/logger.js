const LOG_LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
// Get the current log level from localStorage or environment
const getCurrentLogLevel = () => {
    if (typeof window !== 'undefined') {
        const storedLevel = localStorage.getItem('logLevel');
        if (storedLevel && LOG_LEVEL_PRIORITY[storedLevel] !== undefined) {
            return storedLevel;
        }
    }
    return 'info'; // Default log level
};
let currentLogLevel = getCurrentLogLevel();
export const setLogLevel = (level) => {
    currentLogLevel = level;
    if (typeof window !== 'undefined') {
        localStorage.setItem('logLevel', level);
    }
};
export const createLogger = (namespace) => {
    const formatMessage = (level, message) => {
        return `[${namespace}] ${level.toUpperCase()}: ${message}`;
    };
    const shouldLog = (level) => {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
    };
    const log = (level, message, metadata) => {
        if (!shouldLog(level))
            return;
        const formattedMessage = formatMessage(level, message);
        switch (level) {
            case 'debug':
                console.debug(formattedMessage, metadata || '');
                break;
            case 'info':
                console.info(formattedMessage, metadata || '');
                break;
            case 'warn':
                console.warn(formattedMessage, metadata || '');
                break;
            case 'error':
                console.error(formattedMessage, metadata || '');
                break;
        }
    };
    return {
        debug: (message, metadata) => log('debug', message, metadata),
        info: (message, metadata) => log('info', message, metadata),
        warn: (message, metadata) => log('warn', message, metadata),
        error: (message, metadata) => log('error', message, metadata),
    };
};
export const createErrorMetadata = (error) => {
    if (error instanceof Error) {
        return {
            message: error.message,
            stack: error.stack,
            name: error.name,
        };
    }
    return { error };
};
export const createDataMetadata = (data) => {
    return { data };
};
