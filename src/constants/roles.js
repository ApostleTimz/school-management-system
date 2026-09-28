'use strict';

/** Roles supported by the system. */
const ROLES = Object.freeze({
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
});

const ALL_ROLES = Object.freeze([ROLES.ADMIN, ROLES.TEACHER, ROLES.STUDENT]);

/**
 * Self-registration is deliberately limited to the two non-privileged roles.
 * Admin accounts are only created by an existing administrator through
 * POST /api/users, which stops a public signup form from minting admins.
 */
const SELF_REGISTER_ROLES = Object.freeze([ROLES.STUDENT, ROLES.TEACHER]);

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

const ALL_USER_STATUSES = Object.freeze(Object.values(USER_STATUS));

const TERMS = Object.freeze(['first', 'second', 'third']);

module.exports = {
  ROLES,
  ALL_ROLES,
  SELF_REGISTER_ROLES,
  USER_STATUS,
  ALL_USER_STATUSES,
  TERMS,
};
