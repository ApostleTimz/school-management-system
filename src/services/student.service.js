'use strict';

const db = require('../data/db');
const ApiError = require('../utils/api-error');
const { buildList } = require('../utils/query-params');
const { USER_STATUS } = require('../constants/roles');

const SORT_ACCESSORS = {
  name: (student) => student.name,
  email: (student) => student.email,
  createdAt: (student) => student.createdAt,
  class: (student) => {
    const klass = db.findById('classes', student.classId);
    return klass ? klass.name : '';
  },
};

const SEARCH_FIELDS = ['name', 'email', 'phone'];

/**
 * Response projection. The raw foreign key stays in the payload and a compact
 * summary of the related class is added, so a client can render a student list
 * without a second round-trip.
 */
function toStudentView(student) {
  if (!student) return null;
  const klass = db.findById('classes', student.classId);
  const user = db.findById('users', student.userId);

  return {
    ...student,
    class: klass ? { id: klass.id, name: klass.name, gradeLevel: klass.gradeLevel } : null,
    hasAccount: Boolean(user),
  };
}

function getByIdOrFail(id) {
  const student = db.findById('students', id);
  if (!student) throw ApiError.notFound(`Student not found: ${id}`, { code: 'STUDENT_NOT_FOUND' });
  return student;
}

function list(query = {}) {
  const result = buildList({
    records: db.findAll('students'),
    query,
    searchFields: SEARCH_FIELDS,
    accessors: SORT_ACCESSORS,
    filters: {
      classId: (student, classId) => student.classId === classId,
      status: (student, status) => student.status === status,
      gender: (student, gender) => student.gender === gender,
    },
  });

  return { ...result, items: result.items.map(toStudentView) };
}

/** Class of a student, or a 404 when the student is not assigned yet. */
function getClassForStudent(studentId) {
  const student = getByIdOrFail(studentId);
  if (!student.classId) {
    throw ApiError.notFound('This student is not assigned to a class yet', { code: 'CLASS_NOT_ASSIGNED' });
  }
  const klass = db.findById('classes', student.classId);
  if (!klass) {
    throw ApiError.notFound(`Class not found for student ${studentId}`, { code: 'CLASS_NOT_FOUND' });
  }
  return klass;
}

function create(payload) {
  const email = payload.email.trim().toLowerCase();
  assertEmailAvailable(email);

  if (payload.classId) {
    db.mustExist('classes', payload.classId, 'class');
  }

  return db.insert('students', {
    name: payload.name,
    email,
    phone: payload.phone || null,
    classId: payload.classId || null,
    gender: payload.gender || 'unspecified',
    address: payload.address || null,
    status: payload.status || USER_STATUS.ACTIVE,
    userId: null,
  });
}

async function update(id, patch) {
  const student = getByIdOrFail(id);
  const updates = {};

  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    assertEmailAvailable(email, id);
    updates.email = email;
  }
  if (patch.phone !== undefined) updates.phone = patch.phone || null;
  if (patch.classId !== undefined) {
    if (patch.classId) db.mustExist('classes', patch.classId, 'class');
    updates.classId = patch.classId || null;
  }
  if (patch.gender !== undefined) updates.gender = patch.gender;
  if (patch.address !== undefined) updates.address = patch.address || null;
  if (patch.status !== undefined) updates.status = patch.status;

  return db.updateById('students', id, updates);
}

/**
 * Deleting a student also removes their results, so no orphaned marks are left
 * behind in the store. The linked user account is kept (an admin can manage
 * accounts separately) but the profile link is cleared.
 */
function remove(id) {
  const student = getByIdOrFail(id);
  const removedResults = db.removeWhere('results', (result) => result.studentId === id);
  db.removeById('students', id);

  if (student.userId) {
    const user = db.findById('users', student.userId);
    if (user) db.updateById('users', user.id, { status: USER_STATUS.INACTIVE });
  }

  return { student, removedResults: removedResults.length };
}

/**
 * Resolves the student profile that belongs to a logged-in user account.
 * Lookup order: explicit `userId` link -> matching email -> create a stub so a
 * freshly registered student can always read their own profile.
 */
function resolveProfileForUser(user) {
  const linked = db.findOne('students', (student) => student.userId === user.id);
  if (linked) return linked;

  const byEmail = db.findOne('students', (student) => student.email === user.email);
  if (byEmail) {
    db.updateById('students', byEmail.id, { userId: user.id });
    return db.findById('students', byEmail.id);
  }

  return db.insert('students', {
    name: user.name,
    email: user.email,
    phone: null,
    classId: null,
    gender: 'unspecified',
    address: null,
    status: USER_STATUS.ACTIVE,
    userId: user.id,
  });
}

function assertEmailAvailable(email, exceptId) {
  const existing = db.findOne('students', (student) => student.email === email && student.id !== exceptId);
  if (existing) {
    throw ApiError.conflict(`A student with email "${email}" already exists`, {
      code: 'EMAIL_TAKEN',
      details: [{ field: 'email', message: 'email is already in use' }],
    });
  }
}

module.exports = {
  toStudentView,
  getByIdOrFail,
  list,
  create,
  update,
  remove,
  resolveProfileForUser,
  getClassForStudent,
};
