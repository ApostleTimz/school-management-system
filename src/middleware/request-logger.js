'use strict';

const env = require('../config');
const logger = require('../utils/logger');
const { newRequestId } = require('../utils/ids');

const STATUS_COLORS = {
  success: 'green',
  redirect: 'cyan',
  clientError: 'yellow',
  serverError: 'red',
};

function colorForStatus(status) {
  if (status >= 500) return STATUS_COLORS.serverError;
  if (status >= 400) return STATUS_COLORS.clientError;
  if (status >= 300) return STATUS_COLORS.redirect;
  return STATUS_COLORS.success;
}

/**
 * HTTP request logger.
 *
 * Records method, URL, status code, response time and a timestamp for every
 * request, plus an optional user id once `authenticate` has run. Format is
 * controlled with LOG_FORMAT:
 *   dev      -> compact, one line, coloured
 *   combined -> morgan-style
 *   tiny     -> minimal
 */
function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const requestId = req.headers['x-request-id'] || newRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const { method, originalUrl } = req;
    const status = res.statusCode;
    const color = colorForStatus(status);
    const paint = logger.colors.paint;
    const user = req.user ? ` user=${req.user.id}(${req.user.role})` : '';

    if (env.logFormat === 'tiny') {
      logger.info(`${status} ${method} ${originalUrl} - ${durationMs.toFixed(1)}ms`);
      return;
    }

    if (env.logFormat === 'combined') {
      logger.info(
        `${req.ip} - ${req.method} ${originalUrl} ${status} ${res.getHeader('content-length') || 0} - ${durationMs.toFixed(
          1
        )}ms "${req.get('user-agent') || '-'}"`
      );
      return;
    }

    logger.info(
      `${paint('gray', req.requestId.slice(0, 8))} ${paint('cyan', method.padEnd(6))} ${originalUrl} ${paint(
        color,
        String(status)
      )} ${paint('gray', `${durationMs.toFixed(1)}ms`)}${paint('gray', user)}`
    );
  });

  next();
}

module.exports = requestLogger;
