(function(global) {
  'use strict';

  // Set to true and reload the extension and planner tabs to enable logging.
  const DEBUG = false;

  global.ZaliczGminyLogger = {
    create(scope) {
      const logger = {};
      for (const level of ['debug', 'info', 'warn', 'error']) {
        logger[level] = (...args) => {
          if (DEBUG) global.console[level]('[zaliczgmine]', `[${scope}]`, ...args);
        };
      }
      return logger;
    }
  };
})(globalThis);
