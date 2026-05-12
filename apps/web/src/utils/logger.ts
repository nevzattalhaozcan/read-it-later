type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_LEVEL: LogLevel = import.meta.env.DEV ? 'debug' : 'info';
const CURRENT_LEVEL: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || DEFAULT_LEVEL;

const prefix = '[sonra-okurum]';

const shouldLog = (level: LogLevel) => {
  return LEVELS[level] >= LEVELS[CURRENT_LEVEL];
};

export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (shouldLog('debug')) {
      console.debug(`${prefix} ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (shouldLog('info')) {
      console.log(`${prefix} ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (shouldLog('warn')) {
      console.warn(`${prefix} ${message}`, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    if (shouldLog('error')) {
      console.error(`${prefix} ${message}`, ...args);
    }
  },
};
