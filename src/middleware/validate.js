'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/api-error');

/**
 * Terminates the express-validator chain and converts failures into a single
 * 400 response so every endpoint reports validation problems identically.
 */
function validate(chains = []) {
  return async function validateRequest(req, res, next) {
    try {
      await Promise.all(chains.map((chain) => chain.run(req)));

      const result = validationResult(req);
      if (result.isEmpty()) return next();

      const errors = result.array({ onlyFirstError: false }).map((error) => ({
        field: error.path || error.param || '_',
        message: error.msg,
      }));

      return next(
        ApiError.badRequest('Validation failed', {
          code: 'VALIDATION_ERROR',
          details: errors,
        })
      );
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = validate;
