'use strict';

const HTTP_STATUS = require('../constants/http-status');

/**
 * Operational error carrying an HTTP status code.
 *
 * Anything thrown that is *not* an ApiError is treated as a bug by the global
 * error handler and reported as a generic 500, so internal details (stack
 * traces, driver errors) never reach a client.
 */
class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code || 'ERROR';
    this.details = options.details || null;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', options = {}) {
    return new ApiError(HTTP_STATUS.BAD_REQUEST, message, { code: 'BAD_REQUEST', ...options });
  }

  static unauthorized(message = 'Authentication required', options = {}) {
    return new ApiError(HTTP_STATUS.UNAUTHORIZED, message, { code: 'UNAUTHORIZED', ...options });
  }

  static forbidden(message = 'You do not have permission to perform this action', options = {}) {
    return new ApiError(HTTP_STATUS.FORBIDDEN, message, { code: 'FORBIDDEN', ...options });
  }

  static notFound(message = 'Resource not found', options = {}) {
    return new ApiError(HTTP_STATUS.NOT_FOUND, message, { code: 'NOT_FOUND', ...options });
  }

  static conflict(message = 'Resource already exists', options = {}) {
    return new ApiError(HTTP_STATUS.CONFLICT, message, { code: 'CONFLICT', ...options });
  }

  static tooManyRequests(message = 'Too many requests, please try again later', options = {}) {
    return new ApiError(HTTP_STATUS.TOO_MANY_REQUESTS, message, { code: 'RATE_LIMITED', ...options });
  }

  static internal(message = 'Internal server error', options = {}) {
    return new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, message, { code: 'INTERNAL_ERROR', ...options });
  }
}

module.exports = ApiError;
