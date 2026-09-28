'use strict';

const db = require('../data/db');
const ApiError = require('../utils/api-error');
const { buildList } = require('../utils/query-params');
const { computeGrade } = require('../utils/grade');

const SORT_ACCESSORS = {
  score: (result) => result.score,
  grade: (result) => result.grade,
  term: (result) => result.term,
  createdAt: (result) => result.createdAt,
};

const SEARCH_FIELDS = ['term', 'session', 'remarks'];

/** Result projection with the related student and subject inlined. */
function toResultView(result) {
  if (!result) return null;
  const student = db.findById('students', result.studentId);
  const subject = db.findById('subjects', result.subjectId);
  const klass = result.classId ? db.findById('classes', result.classId) : null;
  const author = result.createdBy ? db.findById('users', result.createdBy) : null;

  return {
    ...result,
    student: student ? { id: student.id, name: student.name, email: student.email } : null,
    subject: subject ? { id: subject.id, name: subject.name, code: subject.code, credits: subject.credits } : null,
    class: klass ? { id: klass.id, name: klass.name } : null,
    recordedBy: author ? { id: author.id, name: author.name, role: author.role } : null,
  };
}

function getByIdOrFail(id) {
  const result = db.findById('results', id);
  if (!result) throw ApiError.notFound(`Result not found: ${id}`, { code: 'RESULT_NOT_FOUND' });
  return result;
}

function list(query = {}) {
  const result = buildList({
    records: db.findAll('results'),
    query,
    searchFields: SEARCH_FIELDS,
    accessors: SORT_ACCESSORS,
    filters: {
      studentId: (record, studentId) => record.studentId === studentId,
      subjectId: (record, subjectId) => record.subjectId === subjectId,
      classId: (record, classId) => record.classId === classId,
      term: (record, term) => record.term === term,
      session: (record, session) => record.session === session,
      grade: (record, grade) => record.grade === grade,
      minScore: (record, min) => record.score >= min,
      maxScore: (record, max) => record.score <= max,
      // A student listing results only ever sees their own.
      ownResultsOnly: (record, userId) => record.studentId === userId,
    },
  });

  return { ...result, items: result.items.map(toResultView) };
}

function create(payload, actor) {
  const student = db.mustExist('students', payload.studentId, 'student');
  const subject = db.mustExist('subjects', payload.subjectId, 'subject');
  assertNoDuplicate(payload);

  const { grade, gradePoint, remark } = computeGrade(payload.score);

  return db.insert('results', {
    studentId: student.id,
    subjectId: subject.id,
    // The class is derived from the student: a client can never file a mark
    // against a class the student does not belong to.
    classId: student.classId,
    score: payload.score,
    grade,
    gradePoint,
    remark,
    term: payload.term,
    session: payload.session,
    remarks: payload.remarks || null,
    createdBy: actor ? actor.id : null,
  });
}

function update(id, patch) {
  const result = getByIdOrFail(id);
  const updates = {};

  if (patch.studentId !== undefined) {
    const student = db.mustExist('students', patch.studentId, 'student');
    updates.studentId = student.id;
    updates.classId = student.classId;
  }

  if (patch.subjectId !== undefined) {
    const subject = db.mustExist('subjects', patch.subjectId, 'subject');
    updates.subjectId = subject.id;
  }

  if (patch.score !== undefined) updates.score = patch.score;
  if (patch.term !== undefined) updates.term = patch.term;
  if (patch.session !== undefined) updates.session = patch.session;
  if (patch.remarks !== undefined) updates.remarks = patch.remarks || null;

  assertNoDuplicate(
    {
      studentId: updates.studentId ?? result.studentId,
      subjectId: updates.subjectId ?? result.subjectId,
      term: updates.term ?? result.term,
      session: updates.session ?? result.session,
    },
    id
  );

  // Grade, grade point and remark are always recalculated from the score.
  const nextScore = updates.score ?? result.score;
  const { grade, gradePoint, remark } = computeGrade(nextScore);
  updates.grade = grade;
  updates.gradePoint = gradePoint;
  updates.remark = remark;

  return db.updateById('results', id, updates);
}

function remove(id) {
  const result = getByIdOrFail(id);
  db.removeById('results', id);
  return result;
}

function listForStudent(studentId, query = {}) {
  return list({ ...query, studentId });
}

function getForStudentOrFail(id, studentId) {
  const result = getByIdOrFail(id);
  if (result.studentId !== studentId) {
    throw ApiError.forbidden('You can only view your own results', { code: 'NOT_RESULT_OWNER' });
  }
  return result;
}

/** One result per student + subject + term + session. */
function assertNoDuplicate({ studentId, subjectId, term, session }, exceptId) {
  const duplicate = db.findOne(
    'results',
    (result) =>
      result.id !== exceptId &&
      result.studentId === studentId &&
      result.subjectId === subjectId &&
      result.term === term &&
      result.session === session
  );

  if (duplicate) {
    throw ApiError.conflict('A result already exists for this student, subject, term and session', {
      code: 'DUPLICATE_RESULT',
      details: [{ field: 'subjectId', message: 'result already recorded (existing id: ' + duplicate.id + ')' }],
    });
  }
}

module.exports = {
  toResultView,
  getByIdOrFail,
  list,
  listForStudent,
  getForStudentOrFail,
  create,
  update,
  remove,
};
