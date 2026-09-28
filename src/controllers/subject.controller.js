'use strict';

const asyncHandler = require('../utils/async-handler');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');
const { queryData } = require('../utils/request-data');
const subjectService = require('../services/subject.service');

/** POST /api/subjects (admin) */
const create = asyncHandler(async (req, res) => {
  const subject = subjectService.create(req.body);
  return sendCreated(res, subjectService.toSubjectView(subject), 'Subject created successfully');
});

/** GET /api/subjects (admin, teacher, student) */
const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = subjectService.list(queryData(req));
  return sendPaginated(res, { items, total, page, limit }, 'Subjects retrieved successfully');
});

/** GET /api/subjects/:id (admin, teacher, student) */
const getOne = asyncHandler(async (req, res) => {
  const subject = subjectService.getByIdOrFail(req.params.id);
  return sendSuccess(res, { message: 'Subject retrieved successfully', data: subjectService.toSubjectView(subject) });
});

/** PUT /api/subjects/:id (admin) */
const update = asyncHandler(async (req, res) => {
  const subject = subjectService.update(req.params.id, req.body);
  return sendSuccess(res, {
    message: 'Subject updated successfully',
    data: subjectService.toSubjectView(subject),
  });
});

/** DELETE /api/subjects/:id (admin) */
const remove = asyncHandler(async (req, res) => {
  const { removedResults } = subjectService.remove(req.params.id);
  return sendSuccess(res, {
    message: 'Subject deleted successfully',
    data: { id: req.params.id, removedResults },
  });
});

module.exports = { create, list, getOne, update, remove };
