'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config');
const ApiError = require('./api-error');

/**
 * Signs a JWT for an authenticated user.
 *
 * The payload only carries non-sensitive identifiers; the role is embedded so
 * that the authorization middleware can work purely from the verified token.
 */
function signToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  return jwt.sign(payload, env.jwt.secret, {
    algorithm: env.jwt.algorithm,
    expiresIn: env.jwt.expiresIn,
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
  });
}

/** Throws an ApiError(401) for any invalid / expired / tampered token. */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwt.secret, {
      algorithms: [env.jwt.algorithm],
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Token has expired, please login again', { code: 'TOKEN_EXPIRED' });
    }
    throw ApiError.unauthorized('Invalid authentication token', { code: 'TOKEN_INVALID' });
  }
}

module.exports = { signToken, verifyToken };
