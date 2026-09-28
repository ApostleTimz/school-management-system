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

const FIELDS = ['name', 'email', 'phone', 'subject', 'staffId', 'status'];

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

const subjectField = (required) =>
  withPresence(body('subject'), { required, field: 'subject' })
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage('subject must be between 2 and 80 characters');

const sharedFields = [
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(PHONE_REGEX)
    .withMessage('phone must be a valid phone number'),
  body('staffId')
    .optional({ values: 'falsy' })
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{2,4}\/?[A-Z0-9]{2,10}$/)
    .withMessage('staffId must look like STF/001 or STF001'),
  body('status')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(Object.values(USER_STATUS))
    .withMessage(`status must be one of: ${Object.values(USER_STATUS).join(', ')}`),
];

const list = [...paginationQuery, ...sortQuery(['name', 'email', 'subject', 'createdAt'])];

const create = [
  body().custom(rejectUnknownFields(FIELDS)),
  nameField(true),
  emailField(true),
  subjectField(false),
  ...sharedFields,
];

const update = [
  body().custom(rejectUnknownFields(FIELDS)),
  body().custom((value) => {
    if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) {
      throw new Error('At least one field is required to update a teacher');
    }
    return true;
  }),
  nameField(false),
  emailField(false),
  subjectField(false),
  ...sharedFields,
];

const id = [idParam('id')];

module.exports = { create, update, list, id, FIELDS };
