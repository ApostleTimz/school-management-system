'use strict';

const { body } = require('express-validator');
const { USER_STATUS } = require('../constants/roles');
const {
  rejectUnknownFields,
  withPresence,
  idParam,
  lowerCase,
  isTrimmedString,
  PHONE_REGEX,
  paginationQuery,
  sortQuery,
} = require('./common');

const GENDERS = ['male', 'female', 'unspecified'];
const FIELDS = ['name', 'email', 'phone', 'classId', 'gender', 'address', 'status'];

/**
 * Field chains are built by factories instead of being shared between the
 * `create` and `update` rule sets: `.optional()` and `.bail()` mutate the
 * chain, so reusing one instance would silently relax the create rules.
 */
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

const sharedFields = [
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(PHONE_REGEX)
    .withMessage('phone must be a valid phone number'),
  body('classId')
    .optional({ values: 'falsy' })
    .bail()
    .isUUID(4)
    .withMessage('classId must be a valid class UUID (send null to leave the student unassigned)'),
  body('gender')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(GENDERS)
    .withMessage(`gender must be one of: ${GENDERS.join(', ')}`),
  body('address')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('address must be at most 200 characters'),
  body('status')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(Object.values(USER_STATUS))
    .withMessage(`status must be one of: ${Object.values(USER_STATUS).join(', ')}`),
];

const list = [...paginationQuery, ...sortQuery(['name', 'email', 'createdAt', 'class'])];

const create = [body().custom(rejectUnknownFields(FIELDS)), nameField(true), emailField(true), ...sharedFields];

const update = [
  body().custom(rejectUnknownFields(FIELDS)),
  body().custom((value) => {
    if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) {
      throw new Error('At least one field is required to update a student');
    }
    return true;
  }),
  nameField(false),
  emailField(false),
  ...sharedFields,
];

const id = [idParam('id')];

module.exports = { create, update, list, id, FIELDS, GENDERS };
