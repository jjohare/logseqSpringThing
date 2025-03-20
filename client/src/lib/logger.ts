/**
 * Simple logger utility with color-coded console output
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  disabled?: boolean;
  level?: LogLevel;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS = {
  debug: '#8c8c8c', // gray
  info: '#4c9aff',  // blue
  warn: '#ffab00',  // orange
  error: '#ff5630', // red
};

export function createLogger(namespace: string, options: LoggerOptions = {}) {
  const { disabled = false, level = 'info' } = options;
  const levelPriority = LOG_LEVEL_PRIORITY[level];

  function shouldLog(msgLevel: LogLevel): boolean {
    if (disabled) return false;
    return LOG_LEVEL_PRIORITY[msgLevel] >= levelPriority;
  }

  function formatMessage(message: any): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) {
      return message.stack ? message.stack : message.message;
    }
    try {
      return JSON.stringify(message, null, 2);
    } catch (e) {
      return String(message);
    }
  }

  function createLogMethod(logLevel: LogLevel) {
    return function(message: any, ...args: any[]) {
      if (!shouldLog(logLevel)) return;

      const color = LOG_COLORS[logLevel];
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
      const prefix = `%c[${timestamp}] [${namespace}]`;

      // Format any Error objects in args
      const formattedArgs = args.map(arg => {
        if (arg instanceof Error) {
          return arg.stack || arg.message;
        }
        return arg;
      });

      console[logLevel === 'debug' ? 'log' : logLevel](
        `${prefix} ${formatMessage(message)}`,
        `color: ${color}; font-weight: bold;`,
        ...formattedArgs
      );
    };
  }

  return {
    debug: createLogMethod('debug'),
    info: createLogMethod('info'),
    warn: createLogMethod('warn'),
    error: createLogMethod('error'),
  };
}

export function createErrorMetadata(error: unknown): Record<string, any> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

export function createDataMetadata(data: Record<string, any>): Record<string, any> {
  return {
    ...data,
    timestamp: new Date().toISOString(),
  };
}