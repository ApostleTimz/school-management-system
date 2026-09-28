'use strict';

/**
 * Wraps an async route handler so rejected promises reach Express' error
 * pipeline. (Express 5 also forwards rejections, but being explicit keeps the
 * handlers portable and makes the intent obvious to a reader.)
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
