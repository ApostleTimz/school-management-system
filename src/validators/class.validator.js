'use strict';

const { body, query } = require('express-validator');
const {
  rejectUnknownFields,
  withPresence,
  idParam,
  isTrimmedString,
  paginationQuery,
  sortQuery,
} = require('./common');

const FIELDS = ['name', 'gradeLevel', 'teacherId', 'capacity', 'description', 'room'];

const nameField = (required) =>
  withPresence(body('name'), { required, field: 'name' })
    .trim()
    .custom(isTrimmedString(100))
    .isLength({ min: 2, max: 100 })
    .withMessage('name must be between 2 and 100 characters');

const gradeLevelField = (required) =>
  withPresence(body('gradeLevel'), { required, field: 'gradeLevel' })
    .isInt({ min: 1, max: 12 })
    .withMessage('gradeLevel must be an integer between 1 and 12')
    .toInt();

const sharedFields = [
  body('teacherId')
    .optional({ values: 'falsy' })
    .bail()
    .isUUID(4)
    .withMessage('teacherId must be a valid teacher UUID (send null to leave the class unassigned)'),
  body('capacity').optional({ values: 'falsy' }).isInt({ min: 1, max: 1000 }).withMessage('capacity must be between 1 and 1000').toInt(),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('description must be at most 200 characters'),
  body('room').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('room must be at most 50 characters'),
];

const list = [
  ...paginationQuery,
  ...sortQuery(['name', 'gradeLevel', 'createdAt']),
  query('gradeLevel').optional().isInt({ min: 1, max: 12 }).withMessage('gradeLevel must be between 1 and 12').toInt(),
  query('teacherId').optional().bail().isUUID(4).withMessage('teacherId must be a valid teacher UUID'),
];

const create = [
  body().custom(rejectUnknownFields(FIELDS)),
  nameField(true),
  gradeLevelField(true),
  ...sharedFields,
];

const update = [
  body().custom(rejectUnknownFields(FIELDS)),
  body().custom((value) => {
    if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) {
      throw new Error('At least one field is required to update a class');
    }
    return true;
  }),
  nameField(false),
  gradeLevelField(false),
  ...sharedFields,
];

const id = [idParam('id')];

module.exports = { create, update, list, id, FIELDS };
