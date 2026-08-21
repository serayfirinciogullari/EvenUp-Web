import app from './app';
import config from './config/env';
import { scheduleAnonymizeExpiredDeletions } from './jobs/anonymizeDeletedUsers.job';
import logger from './utils/logger';

const server = app.listen(config.port, () => {
  logger.info(`EvenUp API calisiyor -> http://localhost:${config.port} (${config.env})`);
  logger.info(`Health check      -> http://localhost:${config.port}/health`);
});

// `app.ts` degil burada: testler `app.ts`i dogrudan import eder, gercek bir
// surec olmadigi icin zamanlayicinin test calismalarinda tetiklenmemesi gerekir.
scheduleAnonymizeExpiredDeletions();

const shutdown = (signal: string): void => {
  logger.info(`${signal} alindi, server kapatiliyor...`);
  server.close(() => {
    logger.info('Server kapandi.');
    process.exit(0);
  });

  // Baglantilar 10sn icinde kapanmazsa zorla cik
  setTimeout(() => process.exit(1), 10000).unref();
};

(['SIGINT', 'SIGTERM'] as const).forEach((signal) => {
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

export default server;
