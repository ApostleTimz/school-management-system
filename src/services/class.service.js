'use strict';

const db = require('../data/db');
const ApiError = require('../utils/api-error');
const { buildList } = require('../utils/query-params');

const SORT_ACCESSORS = {
  name: (klass) => klass.name,
  gradeLevel: (klass) => klass.gradeLevel,
  createdAt: (klass) => klass.createdAt,
};

const SEARCH_FIELDS = ['name', 'description', 'room'];

function toClassView(klass) {
  if (!klass) return null;
  const teacher = db.findById('teachers', klass.teacherId);
  const students = db.findAll('students', (student) => student.classId === klass.id);
  const subjects = db.findAll('subjects', (subject) => subject.isActive);

  return {
    ...klass,
    teacher: teacher ? { id: teacher.id, name: teacher.name, subject: teacher.subject } : null,
    studentCount: students.length,
    // Subjects offered in this class = every active subject (the school-wide
    // curriculum for that grade level).
    subjectCount: subjects.length,
  };
}

function getByIdOrFail(id) {
  const klass = db.findById('classes', id);
  if (!klass) throw ApiError.notFound(`Class not found: ${id}`, { code: 'CLASS_NOT_FOUND' });
  return klass;
}

function list(query = {}) {
  const result = buildList({
    records: db.findAll('classes'),
    query,
    searchFields: SEARCH_FIELDS,
    accessors: SORT_ACCESSORS,
    filters: {
      gradeLevel: (klass, gradeLevel) => klass.gradeLevel === gradeLevel,
      teacherId: (klass, teacherId) => klass.teacherId === teacherId,
    },
  });

  return { ...result, items: result.items.map(toClassView) };
}

function create(payload) {
  assertNameAvailable(payload.name);

  if (payload.teacherId) {
    db.mustExist('teachers', payload.teacherId, 'teacher');
  }

  return db.insert('classes', {
    name: payload.name,
    gradeLevel: payload.gradeLevel,
    teacherId: payload.teacherId || null,
    capacity: payload.capacity ?? null,
    description: payload.description || null,
    room: payload.room || null,
  });
}

function update(id, patch) {
  const klass = getByIdOrFail(id);
  const updates = {};

  if (patch.name !== undefined) {
    assertNameAvailable(patch.name, id);
    updates.name = patch.name;
  }
  if (patch.gradeLevel !== undefined) updates.gradeLevel = patch.gradeLevel;
  if (patch.teacherId !== undefined) {
    if (patch.teacherId) db.mustExist('teachers', patch.teacherId, 'teacher');
    updates.teacherId = patch.teacherId || null;
  }
  if (patch.capacity !== undefined) updates.capacity = patch.capacity || null;
  if (patch.description !== undefined) updates.description = patch.description || null;
  if (patch.room !== undefined) updates.room = patch.room || null;

  return db.updateById('classes', id, updates);
}

/** Deleting a class releases its students (classId -> null) and its results. */
function remove(id) {
  const klass = getByIdOrFail(id);

  const releasedStudents = db.findAll('students', (student) => student.classId === id);
  for (const student of releasedStudents) {
    db.updateById('students', student.id, { classId: null });
  }

  const removedResults = db.removeWhere('results', (result) => result.classId === id);
  db.removeById('classes', id);

  return {
    class: klass,
    releasedStudents: releasedStudents.map((student) => student.id),
    removedResults: removedResults.length,
  };
}

function assertNameAvailable(name, exceptId) {
  const existing = db.findOne(
    'classes',
    (klass) => klass.name.toLowerCase() === name.trim().toLowerCase() && klass.id !== exceptId
  );
  if (existing) {
    throw ApiError.conflict(`A class named "${name}" already exists`, {
      code: 'CLASS_NAME_TAKEN',
      details: [{ field: 'name', message: 'class name must be unique' }],
    });
  }
}

module.exports = {
  toClassView,
  getByIdOrFail,
  list,
  create,
  update,
  remove,
};
