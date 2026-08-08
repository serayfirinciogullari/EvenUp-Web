/* eslint-disable no-console */

import config from '../config/env';

const timestamp = (): string => new Date().toISOString();

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

const logger: Logger = {
  info: (...args) => console.log(`[${timestamp()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${timestamp()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${timestamp()}] [ERROR]`, ...args),
  debug: (...args) => {
    if (!config.isProduction) {
      console.debug(`[${timestamp()}] [DEBUG]`, ...args);
    }
  },
};

export default logger;
