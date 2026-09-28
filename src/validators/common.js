'use strict';

const { param, query } = require('express-validator');
const env = require('../config');

/** UUID v4 — every id in the system is generated with crypto.randomUUID(). */
const isUuid = (field) => param(field).isUUID(4).withMessage(`${field} must be a valid UUID`);

const idParam = (name = 'id') => isUuid(name);

const isTrimmedString = (max = 255) =>
  (value) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

const lowerCase = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Optional phone number: digits, spaces and the usual separators only. */
const PHONE_REGEX = /^\+?[0-9][0-9\s()-]{5,19}$/;

/** Academic session in the "2025/2026" form. */
const SESSION_REGEX = /^\d{4}\s*\/\s*\d{4}$/;

/**
 * Rejects any body key that is not part of the resource contract. This turns a
 * typo (`{"emial": ...}`) or an attempt to smuggle a field such as `role` or
 * `id` into a create/update call into a clear 400 instead of silent data loss.
 */
function rejectUnknownFields(allowedFields, message) {
  const allowed = new Set(allowedFields);
  return (body) => {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return true;
    const unknown = Object.keys(body).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      throw new Error(message || `Unexpected field(s): ${unknown.join(', ')}. Allowed: ${allowedFields.join(', ')}`);
    }
    return true;
  };
}

/**
 * Applies a presence rule as the *first* check in a chain.
 *
 * Order matters: checking presence first and calling `.bail()` means a missing
 * field produces exactly one clear error ("name is required") instead of a
 * cascade of type errors from the validators that follow.
 */
function withPresence(chain, { required, field }) {
  if (!required) return chain.optional({ values: 'falsy' }).bail();
  return chain
    .exists({ values: 'falsy' })
    .withMessage(`${field} is required`)
    .bail();
}

const paginationQuery = [
  query('page').optional().isInt({ min: 1, max: 100000 }).withMessage('page must be a positive integer').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
  query('search')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('search must be between 1 and 100 characters'),
  query('order').optional().toLowerCase().isIn(['asc', 'desc']).withMessage('order must be asc or desc'),
];

const sortQuery = (allowedFields) => [
  query('sortBy')
    .optional()
    .toLowerCase()
    .isIn(allowedFields)
    .withMessage(`sortBy must be one of: ${allowedFields.join(', ')}`),
];

const passwordRules = (field) => [
  (value) => {
    if (typeof value !== 'string' || value.length < env.password.minLength) {
      throw new Error(`${field} must be at least ${env.password.minLength} characters long`);
    }
    if (value.length > env.password.maxLength) {
      throw new Error(`${field} must be at most ${env.password.maxLength} characters long`);
    }
    if (!/[a-z]/.test(value)) throw new Error(`${field} must contain at least one lowercase letter`);
    if (!/[A-Z]/.test(value)) throw new Error(`${field} must contain at least one uppercase letter`);
    if (!/[0-9]/.test(value)) throw new Error(`${field} must contain at least one number`);
    return true;
  },
];

module.exports = {
  idParam,
  isUuid,
  isTrimmedString,
  lowerCase,
  rejectUnknownFields,
  withPresence,
  paginationQuery,
  sortQuery,
  passwordRules,
  PHONE_REGEX,
  SESSION_REGEX,
};
