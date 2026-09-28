'use strict';

const { newId, nowIso } = require('../utils/ids');
const ApiError = require('../utils/api-error');

/**
 * In-memory "database".
 *
 * Each collection is a plain array of documents. The data is intentionally
 * relational through foreign keys:
 *
 *   student.classId  -> classes.id
 *   classes.teacherId-> teachers.id
 *   results.studentId-> students.id
 *   results.subjectId-> subjects.id
 *   *.userId         -> users.id
 *
 * The store is a process singleton: all resets wipe the arrays in place so that
 * modules holding a reference always observe the current data.
 */
const COLLECTIONS = Object.freeze(['users', 'students', 'teachers', 'classes', 'subjects', 'results']);

const store = Object.freeze(
  COLLECTIONS.reduce((acc, name) => {
    acc[name] = [];
    return acc;
  }, {})
);

function collection(name) {
  if (!COLLECTIONS.includes(name)) {
    throw new Error(`Unknown collection "${name}"`);
  }
  return store[name];
}

function insert(name, document) {
  const now = nowIso();
  const record = { id: document.id || newId(), createdAt: now, updatedAt: now, ...document };
  collection(name).push(record);
  return record;
}

function findById(name, id) {
  if (typeof id !== 'string') return null;
  return collection(name).find((record) => record.id === id) || null;
}

function findOne(name, predicate) {
  return collection(name).find(predicate) || null;
}

function findAll(name, predicate) {
  return predicate ? collection(name).filter(predicate) : collection(name).slice();
}

function updateById(name, id, patch) {
  const record = findById(name, id);
  if (!record) return null;
  Object.assign(record, patch, { updatedAt: nowIso() });
  return record;
}

function removeById(name, id) {
  const rows = collection(name);
  const index = rows.findIndex((record) => record.id === id);
  if (index === -1) return null;
  return rows.splice(index, 1)[0];
}

function removeWhere(name, predicate) {
  const rows = collection(name);
  const removed = rows.filter(predicate);
  for (const record of removed) {
    const index = rows.indexOf(record);
    if (index !== -1) rows.splice(index, 1);
  }
  return removed;
}

function count(name) {
  return collection(name).length;
}

function reset() {
  for (const name of COLLECTIONS) store[name].length = 0;
}

function stats() {
  return COLLECTIONS.reduce((acc, name) => {
    acc[name] = count(name);
    return acc;
  }, {});
}

/** Guard used by the seeders and services to assert referential integrity. */
function mustExist(name, id, label) {
  const record = findById(name, id);
  if (!record) {
    throw ApiError.badRequest(`Referenced ${label} "${id}" does not exist`);
  }
  return record;
}

module.exports = {
  COLLECTIONS,
  store,
  collection,
  insert,
  findById,
  findOne,
  findAll,
  updateById,
  removeById,
  removeWhere,
  count,
  reset,
  stats,
  mustExist,
};
