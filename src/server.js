'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');

const server = app.listen(config.port, () => {
  logger.info(`EvenUp API calisiyor -> http://localhost:${config.port} (${config.env})`);
  logger.info(`Health check      -> http://localhost:${config.port}/health`);
});

const shutdown = (signal) => {
  logger.info(`${signal} alindi, server kapatiliyor...`);
  server.close(() => {
    logger.info('Server kapandi.');
    process.exit(0);
  });

  // Baglantilar 10sn icinde kapanmazsa zorla cik
  setTimeout(() => process.exit(1), 10000).unref();
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

module.exports = server;
