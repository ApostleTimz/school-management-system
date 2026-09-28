'use strict';

const ApiError = require('../utils/api-error');
const logger = require('../utils/logger');
const env = require('../config');
const HTTP_STATUS = require('../constants/http-status');

/** Terminal 404 for requests that matched no route. */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, { code: 'ROUTE_NOT_FOUND' }));
}

/**
 * Global error handler.
 *
 * Every failure leaves the API in the same shape:
 *   { "success": false, "message": "...", "code": "...", "errors": [...] }
 *
 * Unexpected (non-ApiError) failures are logged with their stack server-side and
 * reported as an opaque 500 so implementation details never leak to a client.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
function errorHandler(error, req, res, next) {
  let apiError = error;

  if (!(apiError instanceof ApiError)) {
    apiError = translateFrameworkError(error);
  }

  if (apiError.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, error);
  } else if (req.requestId) {
    logger.debug(`${apiError.statusCode} ${apiError.code} on ${req.method} ${req.originalUrl}: ${apiError.message}`);
  }

  if (res.headersSent) {
    // The response is already streaming; destroying the socket is the only
    // safe way to signal failure.
    return req.destroy();
  }

  const body = {
    success: false,
    message: apiError.message,
    code: apiError.code,
  };

  if (apiError.details) body.errors = apiError.details;
  if (req.requestId) body.requestId = req.requestId;
  if (!env.isProduction && apiError.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) body.stack = error.stack;

  return res.status(apiError.statusCode).json(body);
}

/** Maps errors thrown by Express / body-parser into safe client responses. */
function translateFrameworkError(error) {
  if (!error) return ApiError.internal();

  if (error.type === 'entity.parse.failed' || error instanceof SyntaxError) {
    return ApiError.badRequest('Malformed JSON payload', { code: 'INVALID_JSON' });
  }

  if (error.type === 'entity.too.large') {
    return new ApiError(HTTP_STATUS.PAYLOAD_TOO_LARGE, 'Request payload is too large', { code: 'PAYLOAD_TOO_LARGE' });
  }

  if (error.type === 'entity.verify.failed' || error.type === 'encoding.unsupported') {
    return ApiError.badRequest('Request body could not be decoded', { code: 'INVALID_ENCODING' });
  }

  if (error.status === HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE || error.type === 'charset.unsupported') {
    return new ApiError(
      HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
      'Unsupported content type, expected application/json',
      { code: 'UNSUPPORTED_MEDIA_TYPE' }
    );
  }

  if (error.code === 'EBADCSRFTOKEN') {
    return ApiError.forbidden('Invalid CSRF token', { code: 'INVALID_CSRF_TOKEN' });
  }

  return ApiError.internal();
}

module.exports = { errorHandler, notFoundHandler };
