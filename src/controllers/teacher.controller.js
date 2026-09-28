'use strict';

const asyncHandler = require('../utils/async-handler');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');
const { queryData } = require('../utils/request-data');
const teacherService = require('../services/teacher.service');

/** POST /api/teachers (admin) */
const create = asyncHandler(async (req, res) => {
  const teacher = teacherService.create(req.body);
  return sendCreated(res, teacherService.toTeacherView(teacher), 'Teacher created successfully');
});

/** GET /api/teachers (admin) */
const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = teacherService.list(queryData(req));
  return sendPaginated(res, { items, total, page, limit }, 'Teachers retrieved successfully');
});

/** GET /api/teachers/me (teacher) */
const myProfile = asyncHandler(async (req, res) => {
  const teacher = teacherService.resolveProfileForUser(req.user);
  return sendSuccess(res, {
    message: 'Teacher profile retrieved successfully',
    data: teacherService.toTeacherView(teacher),
  });
});

/** GET /api/teachers/:id (admin) */
const getOne = asyncHandler(async (req, res) => {
  const teacher = teacherService.getByIdOrFail(req.params.id);
  return sendSuccess(res, {
    message: 'Teacher retrieved successfully',
    data: teacherService.toTeacherView(teacher),
  });
});

/** PUT /api/teachers/:id (admin) */
const update = asyncHandler(async (req, res) => {
  const teacher = teacherService.update(req.params.id, req.body);
  return sendSuccess(res, {
    message: 'Teacher updated successfully',
    data: teacherService.toTeacherView(teacher),
  });
});

/** DELETE /api/teachers/:id (admin) */
const remove = asyncHandler(async (req, res) => {
  const { releasedClasses } = teacherService.remove(req.params.id);
  return sendSuccess(res, {
    message: 'Teacher deleted successfully',
    data: { id: req.params.id, releasedClasses },
  });
});

module.exports = { create, list, getOne, update, remove, myProfile };
