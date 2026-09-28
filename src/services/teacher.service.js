'use strict';

const db = require('../data/db');
const ApiError = require('../utils/api-error');
const { buildList } = require('../utils/query-params');
const { USER_STATUS } = require('../constants/roles');

const SORT_ACCESSORS = {
  name: (teacher) => teacher.name,
  email: (teacher) => teacher.email,
  subject: (teacher) => teacher.subject,
  createdAt: (teacher) => teacher.createdAt,
};

const SEARCH_FIELDS = ['name', 'email', 'phone', 'subject'];

function toTeacherView(teacher) {
  if (!teacher) return null;
  const classes = db.findAll('classes', (klass) => klass.teacherId === teacher.id);
  const user = db.findById('users', teacher.userId);

  return {
    ...teacher,
    classes: classes.map((klass) => ({ id: klass.id, name: klass.name })),
    hasAccount: Boolean(user),
  };
}

function getByIdOrFail(id) {
  const teacher = db.findById('teachers', id);
  if (!teacher) throw ApiError.notFound(`Teacher not found: ${id}`, { code: 'TEACHER_NOT_FOUND' });
  return teacher;
}

function list(query = {}) {
  const result = buildList({
    records: db.findAll('teachers'),
    query,
    searchFields: SEARCH_FIELDS,
    accessors: SORT_ACCESSORS,
    filters: {
      subject: (teacher, subject) => teacher.subject === subject,
      status: (teacher, status) => teacher.status === status,
    },
  });

  return { ...result, items: result.items.map(toTeacherView) };
}

function create(payload) {
  const email = payload.email.trim().toLowerCase();
  assertEmailAvailable(email);

  return db.insert('teachers', {
    name: payload.name,
    email,
    phone: payload.phone || null,
    subject: payload.subject || null,
    staffId: payload.staffId || null,
    status: payload.status || USER_STATUS.ACTIVE,
    userId: null,
  });
}

function update(id, patch) {
  const teacher = getByIdOrFail(id);
  const updates = {};

  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    assertEmailAvailable(email, id);
    updates.email = email;
  }
  if (patch.phone !== undefined) updates.phone = patch.phone || null;
  if (patch.subject !== undefined) updates.subject = patch.subject || null;
  if (patch.staffId !== undefined) updates.staffId = patch.staffId || null;
  if (patch.status !== undefined) updates.status = patch.status;

  return db.updateById('teachers', id, updates);
}

/**
 * Removes the teacher and unassigns them from any class they were form teacher
 * of. Results they recorded are kept (the marks stay valid) but the author
 * reference is dropped so the view does not dangle.
 */
function remove(id) {
  const teacher = getByIdOrFail(id);
  const releasedClasses = db.findAll('classes', (klass) => klass.teacherId === id);
  for (const klass of releasedClasses) {
    db.updateById('classes', klass.id, { teacherId: null });
  }

  const clearedResults = db.findAll('results', (result) => result.createdBy === id);
  for (const result of clearedResults) {
    db.updateById('results', result.id, { createdBy: null });
  }

  db.removeById('teachers', id);

  if (teacher.userId) {
    const user = db.findById('users', teacher.userId);
    if (user) db.updateById('users', user.id, { status: USER_STATUS.INACTIVE });
  }

  return { teacher, releasedClasses: releasedClasses.map((klass) => klass.id) };
}

function resolveProfileForUser(user) {
  const linked = db.findOne('teachers', (teacher) => teacher.userId === user.id);
  if (linked) return linked;

  const byEmail = db.findOne('teachers', (teacher) => teacher.email === user.email);
  if (byEmail) {
    db.updateById('teachers', byEmail.id, { userId: user.id });
    return db.findById('teachers', byEmail.id);
  }

  return db.insert('teachers', {
    name: user.name,
    email: user.email,
    phone: null,
    subject: null,
    staffId: null,
    status: USER_STATUS.ACTIVE,
    userId: user.id,
  });
}

function assertEmailAvailable(email, exceptId) {
  const existing = db.findOne('teachers', (teacher) => teacher.email === email && teacher.id !== exceptId);
  if (existing) {
    throw ApiError.conflict(`A teacher with email "${email}" already exists`, {
      code: 'EMAIL_TAKEN',
      details: [{ field: 'email', message: 'email is already in use' }],
    });
  }
}

module.exports = {
  toTeacherView,
  getByIdOrFail,
  list,
  create,
  update,
  remove,
  resolveProfileForUser,
};
