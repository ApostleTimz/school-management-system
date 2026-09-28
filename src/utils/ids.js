'use strict';

const crypto = require('crypto');

/** Collision-resistant primary key (UUID v4). */
function newId() {
  return crypto.randomUUID();
}

/** ISO-8601 timestamp used for every `createdAt` / `updatedAt` field. */
function nowIso() {
  return new Date().toISOString();
}

function newRequestId() {
  return crypto.randomUUID();
}

module.exports = { newId, nowIso, newRequestId };
