'use strict';

const ApiError = require('../utils/api-error');
const { verifyToken } = require('../utils/jwt');
const userService = require('../services/user.service');

/** Extracts a bearer token from the Authorization header. */
function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;

  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

/**
 * Authentication middleware.
 *
 * 1. reads the JWT from the Authorization header
 * 2. verifies signature, expiry, issuer and audience
 * 3. loads the current user from the store
 * 4. attaches a sanitised user object to `req.user`
 * 5. rejects the request with 401 when any of that fails
 */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      throw ApiError.unauthorized('Authentication required: send "Authorization: Bearer <token>"', {
        code: 'MISSING_TOKEN',
      });
    }

    const payload = verifyToken(token);
    const user = userService.findById(payload.sub);

    if (!user) {
      throw ApiError.unauthorized('Account associated with this token no longer exists', {
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.status !== 'active') {
      throw ApiError.forbidden('Account is inactive. Contact an administrator.', { code: 'ACCOUNT_INACTIVE' });
    }

    req.user = userService.toPublicUser(user);
    req.token = token;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authenticate, extractToken };
