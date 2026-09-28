'use strict';

const { matchedData } = require('express-validator');

/**
 * Reads validated (and sanitised) values from a request location.
 *
 * Express 5 exposes `req.query` through a getter that re-parses the query
 * string on every access, so in-place sanitisation performed by
 * express-validator (`toInt()`, `toBoolean()`, …) is discarded. `matchedData`
 * returns the values straight from the validation contexts instead, which is
 * both the supported pattern and the reason the list endpoints can trust
 * `limit`/`page`/`isActive` to already be the right type.
 */
function dataFrom(req, location) {
  return matchedData(req, { locations: [location], includeOptionals: false });
}

const queryData = (req) => dataFrom(req, 'query');
const bodyData = (req) => dataFrom(req, 'body');
const paramData = (req) => dataFrom(req, 'params');

module.exports = { queryData, bodyData, paramData };
