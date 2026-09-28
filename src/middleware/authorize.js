'use strict';

const ApiError = require('../utils/api-error');
const { ROLES } = require('../constants/roles');

/**
 * Authorization middleware (role based).
 *
 * Must be mounted *after* `authenticate`, which guarantees `req.user` is a
 * verified, non-sensitive user object. Returns:
 *   401 - the request never reached a valid identity (handled by authenticate)
 *   403 - the identity is valid but the role is not allowed
 */
function authorize(...allowedRoles) {
  const allowed = allowedRoles.flat().filter(Boolean);
  if (allowed.length === 0) {
    throw new Error('authorize() requires at least one role');
  }

  return function authorizeRequest(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required', { code: 'MISSING_USER' }));
    }

    if (!allowed.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`Access denied: this action requires the ${allowed.join(' or ')} role`, {
          code: 'INSUFFICIENT_ROLE',
          details: [{ field: 'role', message: `Required role: ${allowed.join(', ')}. Your role: ${req.user.role}` }],
        })
      );
    }

    return next();
  };
}

/** Convenience wrappers keeping the route tables readable. */
const adminOnly = authorize(ROLES.ADMIN);
const staffOnly = authorize(ROLES.ADMIN, ROLES.TEACHER);
const allRoles = authorize(ROLES.ADMIN, ROLES.TEACHER, ROLES.STUDENT);

module.exports = { authorize, adminOnly, staffOnly, allRoles };
