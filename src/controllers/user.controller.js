'use strict';

const asyncHandler = require('../utils/async-handler');
const ApiError = require('../utils/api-error');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');
const { queryData } = require('../utils/request-data');
const { buildList } = require('../utils/query-params');
const userService = require('../services/user.service');

/** POST /api/users (admin) — the only way to create an administrator. */
const create = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body);
  return sendCreated(res, userService.toPublicUser(user), 'User created successfully');
});

/** GET /api/users (admin) */
const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = buildList({
    records: userService.listUsers(queryData(req)),
    query: queryData(req),
    searchFields: ['name', 'email', 'role'],
    accessors: {
      name: (user) => user.name,
      email: (user) => user.email,
      role: (user) => user.role,
      createdAt: (user) => user.createdAt,
    },
  });

  return sendPaginated(
    res,
    { items: items.map(userService.toPublicUser), total, page, limit },
    'Users retrieved successfully'
  );
});

/** GET /api/users/:id (admin) */
const getOne = asyncHandler(async (req, res) => {
  const user = userService.getUserOrFail(req.params.id);
  return sendSuccess(res, { message: 'User retrieved successfully', data: userService.toPublicUser(user) });
});

/** PUT /api/users/:id (admin) */
const update = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    if (req.body.role !== undefined && req.body.role !== req.user.role) {
      throw ApiError.badRequest('You cannot change your own role', { code: 'SELF_ROLE_CHANGE' });
    }
    if (req.body.status !== undefined && req.body.status !== req.user.status) {
      throw ApiError.badRequest('You cannot deactivate your own account', { code: 'SELF_DEACTIVATION' });
    }
  }

  const user = await userService.updateUser(req.params.id, req.body);
  return sendSuccess(res, { message: 'User updated successfully', data: userService.toPublicUser(user) });
});

/** DELETE /api/users/:id (admin) */
const remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest('You cannot delete your own account', { code: 'SELF_DELETION' });
  }

  const removed = userService.deleteUser(req.params.id);
  if (!removed) {
    throw ApiError.notFound(`User not found: ${req.params.id}`, { code: 'USER_NOT_FOUND' });
  }

  return sendSuccess(res, { message: 'User deleted successfully', data: { id: req.params.id } });
});

module.exports = { create, list, getOne, update, remove };
