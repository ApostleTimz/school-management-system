'use strict';

const asyncHandler = require('../utils/async-handler');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');
const { queryData } = require('../utils/request-data');
const resultService = require('../services/result.service');
const studentService = require('../services/student.service');
const { ROLES } = require('../constants/roles');

/** POST /api/results (admin, teacher) */
const create = asyncHandler(async (req, res) => {
  const result = resultService.create(req.body, req.user);
  return sendCreated(res, resultService.toResultView(result), 'Result created successfully');
});

/**
 * GET /api/results
 *  - admin / teacher: every result (optionally filtered)
 *  - student: only their own results; the scope is applied here in the server
 *    and overwrites anything the client sent in the query string.
 */
const list = asyncHandler(async (req, res) => {
  let query = queryData(req);

  if (req.user.role === ROLES.STUDENT) {
    const own = studentService.resolveProfileForUser(req.user);
    query = { ...queryData(req), studentId: own.id };
  }

  const { items, total, page, limit } = resultService.list(query);
  return sendPaginated(res, { items, total, page, limit }, 'Results retrieved successfully');
});

/** GET /api/results/:id (admin, teacher, owner) */
const getOne = asyncHandler(async (req, res) => {
  const result = resultService.getByIdOrFail(req.params.id);

  if (req.user.role === ROLES.STUDENT) {
    const own = studentService.resolveProfileForUser(req.user);
    resultService.getForStudentOrFail(result.id, own.id);
  }

  return sendSuccess(res, { message: 'Result retrieved successfully', data: resultService.toResultView(result) });
});

/** PUT /api/results/:id (admin, teacher) */
const update = asyncHandler(async (req, res) => {
  const result = resultService.update(req.params.id, req.body);
  return sendSuccess(res, { message: 'Result updated successfully', data: resultService.toResultView(result) });
});

/** DELETE /api/results/:id (admin) */
const remove = asyncHandler(async (req, res) => {
  const result = resultService.remove(req.params.id);
  return sendSuccess(res, { message: 'Result deleted successfully', data: { id: result.id } });
});

module.exports = { create, list, getOne, update, remove };
