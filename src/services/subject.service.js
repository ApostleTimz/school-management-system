'use strict';

const db = require('../data/db');
const ApiError = require('../utils/api-error');
const { buildList } = require('../utils/query-params');

const SORT_ACCESSORS = {
  name: (subject) => subject.name,
  code: (subject) => subject.code,
  credits: (subject) => subject.credits,
  createdAt: (subject) => subject.createdAt,
};

const SEARCH_FIELDS = ['name', 'code', 'description'];

function toSubjectView(subject) {
  if (!subject) return null;
  const resultCount = db.findAll('results', (result) => result.subjectId === subject.id).length;

  return { ...subject, resultCount };
}

function getByIdOrFail(id) {
  const subject = db.findById('subjects', id);
  if (!subject) throw ApiError.notFound(`Subject not found: ${id}`, { code: 'SUBJECT_NOT_FOUND' });
  return subject;
}

function list(query = {}) {
  const result = buildList({
    records: db.findAll('subjects'),
    query,
    searchFields: SEARCH_FIELDS,
    accessors: SORT_ACCESSORS,
    filters: {
      isActive: (subject, isActive) => subject.isActive === isActive,
    },
  });

  return { ...result, items: result.items.map(toSubjectView) };
}

function create(payload) {
  assertCodeAvailable(payload.code);

  return db.insert('subjects', {
    name: payload.name,
    code: payload.code,
    description: payload.description || null,
    credits: payload.credits ?? null,
    isActive: payload.isActive ?? true,
  });
}

function update(id, patch) {
  const subject = getByIdOrFail(id);
  const updates = {};

  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.code !== undefined) {
    assertCodeAvailable(patch.code, id);
    updates.code = patch.code;
  }
  if (patch.description !== undefined) updates.description = patch.description || null;
  if (patch.credits !== undefined) updates.credits = patch.credits || null;
  if (patch.isActive !== undefined) updates.isActive = patch.isActive;

  return db.updateById('subjects', id, updates);
}

/** Deleting a subject removes the marks recorded against it. */
function remove(id) {
  const subject = getByIdOrFail(id);
  const removedResults = db.removeWhere('results', (result) => result.subjectId === id);
  db.removeById('subjects', id);

  return { subject, removedResults: removedResults.length };
}

function assertCodeAvailable(code, exceptId) {
  const existing = db.findOne('subjects', (subject) => subject.code === code && subject.id !== exceptId);
  if (existing) {
    throw ApiError.conflict(`A subject with code "${code}" already exists`, {
      code: 'SUBJECT_CODE_TAKEN',
      details: [{ field: 'code', message: 'subject code must be unique' }],
    });
  }
}

module.exports = {
  toSubjectView,
  getByIdOrFail,
  list,
  create,
  update,
  remove,
};
