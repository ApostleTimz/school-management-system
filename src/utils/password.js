'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config');

/** Hashes a plaintext password with bcrypt. Never store the input. */
async function hashPassword(plain) {
  return bcrypt.hash(plain, env.password.saltRounds);
}

function hashPasswordSync(plain) {
  return bcrypt.hashSync(plain, env.password.saltRounds);
}

/**
 * Constant-time comparison of a candidate password against a stored hash.
 * Returns false for malformed hashes instead of throwing, so a corrupted
 * record can never crash the login path.
 */
async function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || typeof hash !== 'string' || hash.length === 0) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, hashPasswordSync, verifyPassword };
