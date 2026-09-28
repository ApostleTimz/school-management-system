'use strict';

const express = require('express');
const asyncHandler = require('../utils/async-handler');
const { sendSuccess } = require('../utils/response');
const db = require('../data/db');
const env = require('../config');

const router = express.Router();

const bootedAt = Date.now();

/** GET /api/health — liveness probe plus a snapshot of the in-memory store. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    return sendSuccess(res, {
      message: 'School Management API is running',
      data: {
        status: 'ok',
        environment: env.nodeEnv,
        uptimeSeconds: Math.round((Date.now() - bootedAt) / 1000),
        timestamp: new Date().toISOString(),
        database: 'in-memory',
        records: db.stats(),
      },
    });
  })
);

module.exports = router;
