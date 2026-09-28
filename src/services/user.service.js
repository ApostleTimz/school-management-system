'use strict';

const db = require('../data/db');
const ApiError = require('../utils/api-error');
const { hashPassword } = require('../utils/password');
const { nowIso } = require('../utils/ids');
const { ROLES, SELF_REGISTER_ROLES, USER_STATUS } = require('../constants/roles');

/**
 * Strips the password hash (and anything else sensitive) before a user leaves
 * the service layer. Every response body is built from this projection, so a
 * hash cannot be leaked by a forgotten `select`.
 */
function toPublicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function findById(id) {
  return db.findById('users', id);
}

function findByEmail(email) {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return db.findOne('users', (user) => user.email === normalized);
}

/** Admin-only user management (POST /api/users). */
async function createUser(payload) {
  if (findByEmail(payload.email)) {
    throw ApiError.conflict(`A user with email "${payload.email}" already exists`, {
      code: 'EMAIL_TAKEN',
      details: [{ field: 'email', message: 'email is already in use' }],
    });
  }

  const user = db.insert('users', {
    name: payload.name,
    email: payload.email.trim().toLowerCase(),
    passwordHash: await hashPassword(payload.password),
    role: payload.role,
    status: payload.status || USER_STATUS.ACTIVE,
    lastLoginAt: null,
  });

  return user;
}

/**
 * Self-registration. The role is restricted to `SELF_REGISTER_ROLES` here as
 * well as in the validator, so the rule holds even if a controller forgets to
 * check it (defence in depth: the API can never be talked into minting admins).
 */
async function registerUser(payload) {
  const role = payload.role || ROLES.STUDENT;

  if (!SELF_REGISTER_ROLES.includes(role)) {
    throw ApiError.forbidden(`Public registration is limited to the ${SELF_REGISTER_ROLES.join(' or ')} roles`, {
      code: 'ROLE_NOT_SELF_REGISTERABLE',
    });
  }

  return createUser({ ...payload, role });
}

function listUsers(filters = {}) {
  let users = db.findAll('users');

  if (filters.role) users = users.filter((user) => user.role === filters.role);
  if (filters.status) users = users.filter((user) => user.status === filters.status);
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    users = users.filter((user) => user.name.toLowerCase().includes(needle) || user.email.includes(needle));
  }

  return users;
}

function getUserOrFail(id) {
  const user = findById(id);
  if (!user) throw ApiError.notFound(`User not found: ${id}`, { code: 'USER_NOT_FOUND' });
  return user;
}

async function updateUser(id, patch) {
  const user = getUserOrFail(id);
  const updates = {};

  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    const existing = findByEmail(email);
    if (existing && existing.id !== id) {
      throw ApiError.conflict(`A user with email "${email}" already exists`, {
        code: 'EMAIL_TAKEN',
        details: [{ field: 'email', message: 'email is already in use' }],
      });
    }
    updates.email = email;
  }
  if (patch.role !== undefined) updates.role = patch.role;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.password !== undefined) updates.passwordHash = await hashPassword(patch.password);

  return db.updateById('users', id, updates);
}

function deleteUser(id) {
  return db.removeById('users', id);
}

function recordLogin(user) {
  return db.updateById('users', user.id, { lastLoginAt: nowIso() });
}

/** Replaces the stored hash after the caller has verified the current one. */
async function changePassword(userId, newPlainPassword) {
  return db.updateById('users', userId, { passwordHash: await hashPassword(newPlainPassword) });
}

module.exports = {
  toPublicUser,
  findById,
  findByEmail,
  createUser,
  registerUser,
  listUsers,
  getUserOrFail,
  updateUser,
  deleteUser,
  recordLogin,
  changePassword,
};
