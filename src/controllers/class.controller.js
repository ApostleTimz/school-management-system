'use strict';

const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');
const { queryData } = require('../utils/request-data');
const classService = require('../services/class.service');
const studentService = require('../services/student.service');
const { ROLES } = require('../constants/roles');

/** POST /api/classes (admin) */
const create = asyncHandler(async (req, res) => {
  const klass = classService.create(req.body);
  return sendCreated(res, classService.toClassView(klass), 'Class created successfully');
});

/** GET /api/classes (admin, teacher) */
const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = classService.list(queryData(req));
  return sendPaginated(res, { items, total, page, limit }, 'Classes retrieved successfully');
});

/** GET /api/classes/me (student) */
const myClass = asyncHandler(async (req, res) => {
  const student = studentService.resolveProfileForUser(req.user);
  const klass = studentService.getClassForStudent(student.id);

  return sendSuccess(res, {
    message: 'Your class retrieved successfully',
    data: classService.toClassView(klass),
  });
});

/** GET /api/classes/:id (admin, teacher, or a student of that class) */
const getOne = asyncHandler(async (req, res) => {
  const klass = classService.getByIdOrFail(req.params.id);

  if (req.user.role === ROLES.STUDENT) {
    const student = studentService.resolveProfileForUser(req.user);
    if (student.classId !== klass.id) {
      throw ApiError.forbidden('You can only view the class you belong to', { code: 'NOT_CLASS_MEMBER' });
    }
  }

  return sendSuccess(res, { message: 'Class retrieved successfully', data: classService.toClassView(klass) });
});

/** PUT /api/classes/:id (admin) */
const update = asyncHandler(async (req, res) => {
  const klass = classService.update(req.params.id, req.body);
  return sendSuccess(res, { message: 'Class updated successfully', data: classService.toClassView(klass) });
});

/** DELETE /api/classes/:id (admin) */
const remove = asyncHandler(async (req, res) => {
  const { releasedStudents, removedResults } = classService.remove(req.params.id);
  return sendSuccess(res, {
    message: 'Class deleted successfully',
    data: { id: req.params.id, releasedStudents, removedResults },
  });
});

module.exports = { create, list, getOne, update, remove, myClass };
