'use strict';

const env = require('./config');
const { createApp } = require('./app');
const { seedDatabase } = require('./data/seed');
const db = require('./data/db');
const logger = require('./utils/logger');

/**
 * Application entry point: seed the in-memory store, start listening and shut
 * down cleanly on SIGINT/SIGTERM.
 */
async function bootstrap() {
  if (env.seed.enabled) {
    await seedDatabase();
  } else {
    logger.warn('Seeding disabled (SEED_DATA=false): starting with an empty database');
    db.reset();
  }

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info('--------------------------------------------------------------');
    logger.info(`School Management API listening on http://localhost:${env.port}${env.apiPrefix}`);
    logger.info(`Environment: ${env.nodeEnv}  |  Database: in-memory  |  PID: ${process.pid}`);
    logger.info(`Health check: http://localhost:${env.port}${env.apiPrefix}/health`);
    logger.info('--------------------------------------------------------------');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${env.port} is already in use. Set a different PORT in .env and retry.`);
      process.exit(1);
    }
    logger.error('HTTP server error', error);
    process.exit(1);
  });

  const shutdown = (signal) => () => {
    logger.warn(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed. In-memory data has been discarded.');
      process.exit(0);
    });

    // Do not hang forever on lingering keep-alive sockets.
    setTimeout(() => {
      logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  bootstrap().catch((error) => {
    logger.error('Failed to start the server', error);
    process.exit(1);
  });
}

module.exports = { bootstrap };
