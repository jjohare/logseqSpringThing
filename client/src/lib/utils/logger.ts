type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMetadata {
  [key: string]: any;
}

export interface Logger {
  debug: (message: string, metadata?: LogMetadata) => void;
  info: (message: string, metadata?: LogMetadata) => void;
  warn: (message: string, metadata?: LogMetadata) => void;
  error: (message: string, metadata?: LogMetadata) => void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get the current log level from localStorage or environment
const getCurrentLogLevel = (): LogLevel => {
  if (typeof window !== 'undefined') {
    const storedLevel = localStorage.getItem('logLevel');
    if (storedLevel && LOG_LEVEL_PRIORITY[storedLevel as LogLevel] !== undefined) {
      return storedLevel as LogLevel;
    }
  }
  return 'info'; // Default log level
};

let currentLogLevel = getCurrentLogLevel();

export const setLogLevel = (level: LogLevel): void => {
  currentLogLevel = level;
  if (typeof window !== 'undefined') {
    localStorage.setItem('logLevel', level);
  }
};

export const createLogger = (namespace: string): Logger => {
  const formatMessage = (level: LogLevel, message: string): string => {
    return `[${namespace}] ${level.toUpperCase()}: ${message}`;
  };

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLogLevel];
  };

  const log = (level: LogLevel, message: string, metadata?: LogMetadata): void => {
    if (!shouldLog(level)) return;

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
    debug: (message: string, metadata?: LogMetadata) => log('debug', message, metadata),
    info: (message: string, metadata?: LogMetadata) => log('info', message, metadata),
    warn: (message: string, metadata?: LogMetadata) => log('warn', message, metadata),
    error: (message: string, metadata?: LogMetadata) => log('error', message, metadata),
  };
};

export const createErrorMetadata = (error: unknown): LogMetadata => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }
  return { error };
};

export const createDataMetadata = (data: any): LogMetadata => {
  return { data };
};