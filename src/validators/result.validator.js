'use strict';

const { body, query } = require('express-validator');
const { TERMS } = require('../constants/roles');
const { GRADES, computeGrade } = require('../utils/grade');
const {
  rejectUnknownFields,
  withPresence,
  idParam,
  SESSION_REGEX,
  paginationQuery,
  sortQuery,
} = require('./common');

const FIELDS = ['studentId', 'subjectId', 'score', 'grade', 'term', 'session', 'remarks'];

/**
 * The letter grade is derived server-side from the score so a client can never
 * post "score 30 / grade A". A client-supplied grade is accepted only when it
 * agrees with the computed one.
 */
function assertGradeMatchesScore(value, { req }) {
  if (value === undefined) return true;
  const expected = computeGrade(req.body.score).grade;
  if (value !== expected) {
    throw new Error(`grade "${value}" is inconsistent with score ${req.body.score}; expected "${expected}"`);
  }
  return true;
}

const studentIdField = (required) =>
  withPresence(body('studentId'), { required, field: 'studentId' })
    .bail()
    .isUUID(4)
    .withMessage('studentId must be a valid student UUID');

const subjectIdField = (required) =>
  withPresence(body('subjectId'), { required, field: 'subjectId' })
    .bail()
    .isUUID(4)
    .withMessage('subjectId must be a valid subject UUID');

const scoreField = (required) =>
  withPresence(body('score'), { required, field: 'score' })
    .bail()
    .isFloat({ min: 0, max: 100 })
    .withMessage('score must be a number between 0 and 100')
    .toFloat();

const termField = (required) =>
  withPresence(body('term'), { required, field: 'term' })
    .trim()
    .toLowerCase()
    .isIn(TERMS)
    .withMessage(`term must be one of: ${TERMS.join(', ')}`);

const sessionField = (required) =>
  withPresence(body('session'), { required, field: 'session' })
    .trim()
    .matches(SESSION_REGEX)
    .withMessage('session must look like 2025/2026');

const gradeField = () =>
  body('grade')
    .optional({ values: 'falsy' })
    .trim()
    .toUpperCase()
    .bail()
    .isIn(GRADES)
    .withMessage(`grade must be one of: ${GRADES.join(', ')}`)
    .custom(assertGradeMatchesScore);

const remarksField = () =>
  body('remarks')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('remarks must be at most 200 characters');

const list = [
  ...paginationQuery,
  ...sortQuery(['score', 'grade', 'term', 'createdAt']),
  query('studentId').optional().bail().isUUID(4).withMessage('studentId must be a valid student UUID'),
  query('subjectId').optional().bail().isUUID(4).withMessage('subjectId must be a valid subject UUID'),
  query('classId').optional().bail().isUUID(4).withMessage('classId must be a valid class UUID'),
  query('term').optional().trim().toLowerCase().isIn(TERMS).withMessage(`term must be one of: ${TERMS.join(', ')}`),
  query('session').optional().trim().matches(SESSION_REGEX).withMessage('session must look like 2025/2026'),
  query('grade').optional().trim().toUpperCase().isIn(GRADES).withMessage(`grade must be one of: ${GRADES.join(', ')}`),
  query('minScore').optional().isFloat({ min: 0, max: 100 }).withMessage('minScore must be between 0 and 100').toFloat(),
  query('maxScore').optional().isFloat({ min: 0, max: 100 }).withMessage('maxScore must be between 0 and 100').toFloat(),
  query('minScore')
    .custom((value, { req }) => {
      if (value === undefined || req.query.maxScore === undefined) return true;
      if (Number(value) > Number(req.query.maxScore)) throw new Error('minScore cannot be greater than maxScore');
      return true;
    })
    .withMessage('minScore cannot be greater than maxScore'),
];

const create = [
  body().custom(rejectUnknownFields(FIELDS)),
  studentIdField(true),
  subjectIdField(true),
  scoreField(true),
  termField(true),
  sessionField(true),
  gradeField(),
  remarksField(),
];

const update = [
  body().custom(rejectUnknownFields(FIELDS)),
  body().custom((value) => {
    if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) {
      throw new Error('At least one field is required to update a result');
    }
    return true;
  }),
  studentIdField(false),
  subjectIdField(false),
  scoreField(false),
  termField(false),
  sessionField(false),
  gradeField(),
  remarksField(),
];

const id = [idParam('id')];

module.exports = { create, update, list, id, FIELDS };
