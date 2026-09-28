'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const env = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');
const requestLogger = require('./middleware/request-logger');
const { globalLimiter } = require('./middleware/rate-limit');

/**
 * Builds the Express application.
 *
 * Exported separately from the server so tests (and any future integration) can
 * mount the API without binding a port.
 */
function createApp() {
  const app = express();

  // Correct client IPs behind a known number of proxies; required for the
  // per-IP rate limiters to be accurate.
  app.set('trust proxy', env.trustProxyHops);
  app.disable('x-powered-by');

  // --- Security headers ------------------------------------------------------
  app.use(helmet());

  // --- CORS ------------------------------------------------------------------
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? '*' : env.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    })
  );

  // --- Request logging -------------------------------------------------------
  app.use(requestLogger);

  // --- Body parsing ----------------------------------------------------------
  // `strict: true` rejects primitive payloads such as `"hello"` or `42`, so a
  // client cannot smuggle a non-object body past the validators.
  app.use(
    express.json({
      limit: env.jsonBodyLimit,
      strict: true,
    })
  );
  app.use(express.urlencoded({ extended: false, limit: env.jsonBodyLimit }));

  // express-validator assumes an object body; guarantee it for requests that
  // arrive without a JSON content type.
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });

  // --- Routes ----------------------------------------------------------------
  app.use(env.apiPrefix, globalLimiter, routes);

  // Convenience redirect so GET / does not 404 in a browser.
  app.get('/', (req, res) => res.redirect(`${env.apiPrefix}/health`));

  // --- Terminal handlers -----------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
