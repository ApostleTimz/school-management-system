'use strict';

const HTTP_STATUS = require('../constants/http-status');

/**
 * Single response envelope for the whole API.
 *
 *   success: { success: true,  message, data, meta? }
 *   error:   { success: false, message, code?, errors? }
 */
function sendSuccess(res, { statusCode = HTTP_STATUS.OK, message, data = null, meta } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function sendCreated(res, data, message) {
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message, data });
}

function sendPaginated(res, { items, total, page, limit }, message) {
  return sendSuccess(res, {
    message,
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      count: items.length,
    },
  });
}

module.exports = { sendSuccess, sendCreated, sendPaginated };
