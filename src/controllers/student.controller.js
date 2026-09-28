'use strict';

const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');
const { queryData } = require('../utils/request-data');
const studentService = require('../services/student.service');
const classService = require('../services/class.service');
const resultService = require('../services/result.service');
const { ROLES } = require('../constants/roles');

/** POST /api/students (admin) */
const create = asyncHandler(async (req, res) => {
  const student = studentService.create(req.body);
  return sendCreated(res, studentService.toStudentView(student), 'Student created successfully');
});

/** GET /api/students (admin, teacher) */
const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = studentService.list(queryData(req));
  return sendPaginated(res, { items, total, page, limit }, 'Students retrieved successfully');
});

/** GET /api/students/me (student) */
const myProfile = asyncHandler(async (req, res) => {
  const student = studentService.resolveProfileForUser(req.user);
  return sendSuccess(res, {
    message: 'Student profile retrieved successfully',
    data: studentService.toStudentView(student),
  });
});

/** GET /api/students/me/class (student) */
const myClass = asyncHandler(async (req, res) => {
  const student = studentService.resolveProfileForUser(req.user);
  const klass = studentService.getClassForStudent(student.id);
  return sendSuccess(res, { message: 'Class retrieved successfully', data: classService.toClassView(klass) });
});

/** GET /api/students/me/results (student) */
const myResults = asyncHandler(async (req, res) => {
  const student = studentService.resolveProfileForUser(req.user);
  const { items, total, page, limit } = resultService.listForStudent(student.id, queryData(req));
  return sendPaginated(res, { items, total, page, limit }, 'Your results retrieved successfully');
});

/** GET /api/students/:id (admin, teacher, owner) */
const getOne = asyncHandler(async (req, res) => {
  const student = studentService.getByIdOrFail(req.params.id);
  assertOwnership(req, student);

  return sendSuccess(res, {
    message: 'Student retrieved successfully',
    data: studentService.toStudentView(student),
  });
});

/** PUT /api/students/:id (admin) */
const update = asyncHandler(async (req, res) => {
  const student = await studentService.update(req.params.id, req.body);
  return sendSuccess(res, {
    message: 'Student updated successfully',
    data: studentService.toStudentView(student),
  });
});

/** DELETE /api/students/:id (admin) */
const remove = asyncHandler(async (req, res) => {
  const { removedResults } = studentService.remove(req.params.id);
  return sendSuccess(res, {
    message: 'Student deleted successfully',
    data: { id: req.params.id, removedResults },
  });
});

/**
 * A student may only read their own record; staff may read any record.
 * Returning 403 (not 404) keeps "exists but not yours" distinguishable from
 * "does not exist", which is the documented behaviour for this API.
 */
function assertOwnership(req, student) {
  if (req.user.role === ROLES.STUDENT) {
    const own = studentService.resolveProfileForUser(req.user);
    if (own.id !== student.id) {
      throw ApiError.forbidden('You can only view your own student profile', { code: 'NOT_STUDENT_OWNER' });
    }
  }
}

module.exports = { create, list, getOne, update, remove, myProfile, myClass, myResults };
