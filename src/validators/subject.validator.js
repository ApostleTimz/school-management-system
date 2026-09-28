'use strict';

const { body, query } = require('express-validator');
const { rejectUnknownFields, withPresence, idParam, isTrimmedString, paginationQuery, sortQuery } = require('./common');

const FIELDS = ['name', 'code', 'description', 'credits', 'isActive'];

const nameField = (required) =>
  withPresence(body('name'), { required, field: 'name' })
    .trim()
    .custom(isTrimmedString(100))
    .isLength({ min: 2, max: 100 })
    .withMessage('name must be between 2 and 100 characters');

const codeField = (required) =>
  withPresence(body('code'), { required, field: 'code' })
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{2,4}[0-9]{3,4}$/)
    .withMessage('code must look like MATH101 (2-4 letters followed by 3-4 digits)');

const sharedFields = [
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('description must be at most 200 characters'),
  body('credits').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }).withMessage('credits must be between 1 and 12').toInt(),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
];

const list = [
  ...paginationQuery,
  ...sortQuery(['name', 'code', 'credits', 'createdAt']),
  query('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
];

const create = [body().custom(rejectUnknownFields(FIELDS)), nameField(true), codeField(true), ...sharedFields];

const update = [
  body().custom(rejectUnknownFields(FIELDS)),
  body().custom((value) => {
    if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) {
      throw new Error('At least one field is required to update a subject');
    }
    return true;
  }),
  nameField(false),
  codeField(false),
  ...sharedFields,
];

const id = [idParam('id')];

module.exports = { create, update, list, id, FIELDS };
