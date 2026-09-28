'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config');
const ApiError = require('../utils/api-error');
const logger = require('../utils/logger');

/** Keeps every response in the standard error envelope. */
function limitHandler(req, res, next, options) {
  logger.warn(`Rate limit hit: ${req.method} ${req.originalUrl} by ${req.ip}`);
  return next(options.tooManyRequests());
}

function buildLimiter({ windowMs, max, code, scope, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit: max,
    // Rate-limit state is per-process, which is exactly right for an in-memory
    // single-instance API. A multi-instance deployment would swap in a shared
    // store (e.g. the RedisStore) here.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    // The app sets `trust proxy` explicitly from TRUST_PROXY_HOPS, so the
    // library's guess about proxy topology is not relevant.
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: (req, res, next) =>
      limitHandler(req, res, next, {
        tooManyRequests: () =>
          ApiError.tooManyRequests(
            `Too many ${scope} requests from this IP. Please try again later.`,
            { code }
          ),
      }),
  });
}

/** Broad ceiling applied to every /api route. */
const globalLimiter = buildLimiter({
  windowMs: env.rateLimit.global.windowMs,
  max: env.rateLimit.global.max,
  code: 'GLOBAL_RATE_LIMITED',
  scope: 'API',
});

/** Shared bucket for /api/auth/register and /api/auth/login. */
const authLimiter = buildLimiter({
  windowMs: env.rateLimit.auth.windowMs,
  max: env.rateLimit.auth.max,
  code: 'AUTH_RATE_LIMITED',
  scope: 'authentication',
});

/**
 * Login-only limiter. Successful logins are not counted, so an active school
 * staff member is never locked out while credential-stuffing still burns
 * through the budget on failures.
 */
const loginLimiter = buildLimiter({
  windowMs: env.rateLimit.login.windowMs,
  max: env.rateLimit.login.max,
  code: 'LOGIN_RATE_LIMITED',
  scope: 'login',
  skipSuccessfulRequests: true,
});

module.exports = { globalLimiter, authLimiter, loginLimiter };
