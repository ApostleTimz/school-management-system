'use strict';

const { body, query } = require('express-validator');
const { ALL_ROLES, USER_STATUS } = require('../constants/roles');
const {
  rejectUnknownFields,
  withPresence,
  idParam,
  lowerCase,
  isTrimmedString,
  passwordRules,
  paginationQuery,
  sortQuery,
} = require('./common');

const CREATE_FIELDS = ['name', 'email', 'password', 'role', 'status', 'phone'];
const UPDATE_FIELDS = ['name', 'email', 'password', 'role', 'status'];

const nameField = (required) =>
  withPresence(body('name'), { required, field: 'name' })
    .trim()
    .custom(isTrimmedString(80))
    .isLength({ min: 2, max: 80 })
    .withMessage('name must be between 2 and 80 characters');

const emailField = (required) =>
  withPresence(body('email'), { required, field: 'email' })
    .trim()
    .customSanitizer(lowerCase)
    .isEmail()
    .withMessage('A valid email address is required')
    .isLength({ max: 120 })
    .withMessage('email must be at most 120 characters');

const roleField = (required) =>
  withPresence(body('role'), { required, field: 'role' })
    .trim()
    .toLowerCase()
    .isIn(ALL_ROLES)
    .withMessage(`role must be one of: ${ALL_ROLES.join(', ')}`);

const statusField = () =>
  body('status')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(Object.values(USER_STATUS))
    .withMessage(`status must be one of: ${Object.values(USER_STATUS).join(', ')}`);

const create = [
  body().custom(rejectUnknownFields(CREATE_FIELDS)),
  nameField(true),
  emailField(true),
  withPresence(body('password'), { required: true, field: 'password' }).bail().custom(...passwordRules('password')),
  roleField(true),
  statusField(),
];

const update = [
  body().custom(rejectUnknownFields(UPDATE_FIELDS)),
  body().custom((value) => {
    if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) {
      throw new Error('At least one field is required to update a user');
    }
    return true;
  }),
  nameField(false),
  emailField(false),
  body('password').optional({ values: 'falsy' }).bail().custom(...passwordRules('password')),
  roleField(false),
  statusField(),
];

const list = [
  ...paginationQuery,
  ...sortQuery(['name', 'email', 'role', 'createdAt']),
  query('role').optional().trim().toLowerCase().isIn(ALL_ROLES).withMessage(`role must be one of: ${ALL_ROLES.join(', ')}`),
  query('status')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(Object.values(USER_STATUS))
    .withMessage(`status must be one of: ${Object.values(USER_STATUS).join(', ')}`),
];

const id = [idParam('id')];

module.exports = { create, update, list, id, CREATE_FIELDS, UPDATE_FIELDS };
