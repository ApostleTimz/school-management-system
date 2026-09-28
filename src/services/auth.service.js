'use strict';

const ApiError = require('../utils/api-error');
const userService = require('./user.service');
const studentService = require('./student.service');
const teacherService = require('./teacher.service');
const { verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const env = require('../config');
const { ROLES } = require('../constants/roles');

/**
 * Registration: creates the account, then the matching profile record so the
 * new user is immediately visible in the students/teachers collection and the
 * relational links (userId) are in place from the start.
 */
async function register(payload) {
  const user = await userService.registerUser(payload);

  let profile = null;
  if (user.role === ROLES.STUDENT) {
    profile = studentService.resolveProfileForUser(user);
  } else if (user.role === ROLES.TEACHER) {
    profile = teacherService.resolveProfileForUser(user);
  }

  return { user: userService.toPublicUser(user), profile, token: signToken(user) };
}

/**
 * Login.
 *
 * Unknown email and wrong password both return the same 401 message so the
 * endpoint cannot be used to enumerate registered accounts.
 */
async function login({ email, password }) {
  const user = userService.findByEmail(email);

  if (!user) {
    // Hash anyway to keep the timing of a missing account comparable to a
    // wrong password (mitigates user enumeration by response time).
    await verifyPassword(password, '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789012345678901234567');
    throw ApiError.unauthorized('Invalid email or password', { code: 'INVALID_CREDENTIALS' });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw ApiError.unauthorized('Invalid email or password', { code: 'INVALID_CREDENTIALS' });
  }

  if (user.status !== 'active') {
    throw ApiError.forbidden('Account is inactive. Contact an administrator.', { code: 'ACCOUNT_INACTIVE' });
  }

  userService.recordLogin(user);

  // The sanitised projection is what leaves the service layer: the raw record
  // (which holds the bcrypt hash) never travels towards the controller.
  return {
    user: userService.toPublicUser(user),
    token: signToken(user),
    tokenType: 'Bearer',
    expiresIn: env.jwt.expiresIn,
  };
}

async function changePassword(user, { currentPassword, newPassword }) {
  const stored = userService.findById(user.id);
  const valid = await verifyPassword(currentPassword, stored.passwordHash);

  if (!valid) {
    throw ApiError.unauthorized('Current password is incorrect', { code: 'INVALID_CURRENT_PASSWORD' });
  }

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('New password must be different from the current password', {
      code: 'PASSWORD_REUSED',
    });
  }

  return userService.changePassword(user.id, newPassword);
}

module.exports = { register, login, changePassword };
