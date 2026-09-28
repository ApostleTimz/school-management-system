'use strict';

/**
 * Integration tests for the School Management API.
 *
 * These run against a real HTTP server bound to an ephemeral port, so routing,
 * middleware order, validation, authorization and error handling are all
 * exercised exactly as a client would see them.
 *
 *   npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Configuration is read once at import time, so the test environment has to be
// prepared *before* the app is loaded. dotenv does not override values that are
// already present in process.env, which makes this safe and non-destructive.
process.env.NODE_ENV = 'test';
process.env.LOG_SILENT = 'true';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.LOGIN_RATE_LIMIT_MAX = '10000';
process.env.GLOBAL_RATE_LIMIT_MAX = '100000';
process.env.SEED_DATA = 'true';

const { createApp } = require('../src/app');
const { seedDatabase } = require('../src/data/seed');
const db = require('../src/data/db');
const userService = require('../src/services/user.service');

const ADMIN = { email: 'admin@school.test', password: 'Admin@12345' };
const TEACHER = { email: 'teacher@school.test', password: 'Teacher@12345' };
const STUDENT = { email: 'student@school.test', password: 'Student@12345' };

let baseUrl;
let server;

const state = {
  adminToken: null,
  teacherToken: null,
  studentToken: null,
  studentId: null,
  otherStudentId: null,
  classId: null,
  otherClassId: null,
  subjectId: null,
  teacherId: null,
  resultId: null,
};

/** Minimal fetch wrapper returning status + parsed body for every response. */
async function api(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: response.status, json, text, headers: response.headers };
}

async function login(credentials) {
  const res = await api('POST', '/api/auth/login', { body: credentials });
  assert.equal(res.status, 200, `login failed for ${credentials.email}: ${res.text}`);
  return res.json.data.token;
}

test.before(async () => {
  await seedDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  state.adminToken = await login(ADMIN);
  state.teacherToken = await login(TEACHER);
  state.studentToken = await login(STUDENT);

  state.studentId = db.findOne('students', (s) => s.userId === userService.findByEmail(STUDENT.email).id).id;
  state.teacherId = db.findAll('teachers')[0].id;
  state.classId = db.findById('students', state.studentId).classId;
  state.otherClassId = db.findAll('classes').find((c) => c.id !== state.classId).id;
  state.subjectId = db.findAll('subjects')[0].id;
});

test.after(() => {
  if (server) server.close();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

test('GET /api/health reports service and in-memory record counts', async () => {
  const res = await api('GET', '/api/health');

  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.json.data.status, 'ok');
  assert.equal(res.json.data.database, 'in-memory');
  assert.ok(res.json.data.records.students > 0);
  assert.ok(res.json.data.records.results > 0);
});

test('unknown route returns 404 in the standard error envelope', async () => {
  const res = await api('GET', '/api/does-not-exist', { token: state.adminToken });

  assert.equal(res.status, 404);
  assert.equal(res.json.success, false);
  assert.match(res.json.message, /Route not found/);
});

// ---------------------------------------------------------------------------
// Registration + validation
// ---------------------------------------------------------------------------

test('POST /api/auth/register creates a student account and a linked profile', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: {
      name: 'Test Registrant',
      email: 'New.Registrant@School.Test',
      password: 'StrongPass1',
      confirmPassword: 'StrongPass1',
      role: 'student',
      phone: '+2348090000001',
    },
  });

  assert.equal(res.status, 201, res.text);
  assert.equal(res.json.success, true);
  assert.ok(res.json.data.token);
  assert.equal(res.json.data.user.email, 'new.registrant@school.test', 'email should be normalised');
  assert.equal(res.json.data.user.role, 'student');
  assert.equal(res.json.data.profile.userId, res.json.data.user.id, 'profile is linked to the account');
  assert.ok(res.json.data.profile.createdAt);
});

test('POST /api/auth/register rejects a duplicate email with 409', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: { name: 'Duplicate', email: ADMIN.email, password: 'StrongPass1' },
  });

  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'EMAIL_TAKEN');
});

test('POST /api/auth/register refuses to self-register an administrator', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: { name: 'Sneaky Admin', email: 'sneaky@school.test', password: 'StrongPass1', role: 'admin' },
  });

  assert.equal(res.status, 400);
  assert.match(res.json.errors[0].message, /role must be one of/);
});

test('POST /api/auth/register rejects an invalid role', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: { name: 'Bad Role', email: 'badrole@school.test', password: 'StrongPass1', role: 'superuser' },
  });

  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'VALIDATION_ERROR');
});

test('POST /api/auth/register validates email format and password strength', async () => {
  const badEmail = await api('POST', '/api/auth/register', {
    body: { name: 'Bad Email', email: 'not-an-email', password: 'StrongPass1' },
  });
  assert.equal(badEmail.status, 400);
  assert.ok(badEmail.json.errors.some((e) => e.field === 'email'));

  const weak = await api('POST', '/api/auth/register', {
    body: { name: 'Weak Pass', email: 'weak@school.test', password: 'abc' },
  });
  assert.equal(weak.status, 400);
  assert.ok(weak.json.errors.some((e) => e.field === 'password'));

  const noUpper = await api('POST', '/api/auth/register', {
    body: { name: 'No Upper', email: 'noupper@school.test', password: 'weakpass1' },
  });
  assert.equal(noUpper.status, 400);
  assert.ok(noUpper.json.errors.some((e) => e.field === 'password'));
});

test('POST /api/auth/register reports every invalid field at once', async () => {
  const res = await api('POST', '/api/auth/register', { body: { name: '', email: 'x' } });

  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'VALIDATION_ERROR');
  const fields = res.json.errors.map((e) => e.field);
  assert.ok(fields.includes('name'));
  assert.ok(fields.includes('email'));
  assert.ok(fields.includes('password'));
});

test('POST /api/auth/register rejects unexpected fields', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: { name: 'Sneaky', email: 'sneaky2@school.test', password: 'StrongPass1', isAdmin: true },
  });

  assert.equal(res.status, 400);
  assert.match(res.json.errors[0].message, /Unexpected field/);
});

test('POST /api/auth/register rejects a mismatched confirmPassword', async () => {
  const res = await api('POST', '/api/auth/register', {
    body: {
      name: 'Mismatch',
      email: 'mismatch@school.test',
      password: 'StrongPass1',
      confirmPassword: 'StrongPass2',
    },
  });

  assert.equal(res.status, 400);
  assert.ok(res.json.errors.some((e) => e.field === 'confirmPassword'));
});

test('malformed JSON returns 400 instead of crashing', async () => {
  const res = await api('POST', '/api/auth/login', { raw: '{"email": "admin@school.test", "password":' });

  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'INVALID_JSON');
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

test('POST /api/auth/login returns a JWT and never the password hash', async () => {
  const res = await api('POST', '/api/auth/login', { body: ADMIN });

  assert.equal(res.status, 200);
  assert.equal(res.json.data.tokenType, 'Bearer');
  assert.ok(res.json.data.expiresIn);
  assert.equal(res.json.data.user.email, ADMIN.email);
  assert.equal(res.json.data.user.passwordHash, undefined);
  assert.ok(!res.text.includes('passwordHash'));
  assert.ok(!res.text.includes('$2b$'), 'no bcrypt hash may appear in a response');
});

test('login with a wrong password and with an unknown email both return 401', async () => {
  const wrong = await api('POST', '/api/auth/login', {
    body: { email: ADMIN.email, password: 'WrongPass123' },
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.code, 'INVALID_CREDENTIALS');

  const unknown = await api('POST', '/api/auth/login', {
    body: { email: 'ghost@school.test', password: 'WrongPass123' },
  });
  assert.equal(unknown.status, 401);
  assert.equal(
    unknown.json.message,
    wrong.json.message,
    'identical message prevents account enumeration'
  );
});

test('login validation rejects a missing password', async () => {
  const res = await api('POST', '/api/auth/login', { body: { email: ADMIN.email } });

  assert.equal(res.status, 400);
  assert.ok(res.json.errors.some((e) => e.field === 'password'));
});

test('GET /api/auth/me returns the authenticated user without sensitive fields', async () => {
  const res = await api('GET', '/api/auth/me', { token: state.studentToken });

  assert.equal(res.status, 200);
  assert.equal(res.json.data.user.email, STUDENT.email);
  assert.equal(res.json.data.user.role, 'student');
  assert.equal(res.json.data.user.passwordHash, undefined);
  assert.ok(res.json.data.profile, 'a student gets their linked profile');
});

test('POST /api/auth/change-password requires the correct current password', async () => {
  const res = await api('POST', '/api/auth/change-password', {
    token: state.studentToken,
    body: { currentPassword: 'NotMyPassword1', newPassword: 'BrandNewPass9' },
  });

  assert.equal(res.status, 401);
  assert.equal(res.json.code, 'INVALID_CURRENT_PASSWORD');
});

test('POST /api/auth/change-password updates the password and the new one works', async () => {
  const email = 'changer@school.test';
  const registered = await api('POST', '/api/auth/register', {
    body: { name: 'Changer', email, password: 'FirstPass123' },
  });
  const token = registered.json.data.token;

  const changed = await api('POST', '/api/auth/change-password', {
    token,
    body: { currentPassword: 'FirstPass123', newPassword: 'SecondPass123', confirmNewPassword: 'SecondPass123' },
  });
  assert.equal(changed.status, 200, changed.text);

  assert.equal((await api('POST', '/api/auth/login', { body: { email, password: 'FirstPass123' } })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { body: { email, password: 'SecondPass123' } })).status, 200);
});

// ---------------------------------------------------------------------------
// Authentication middleware -> 401
// ---------------------------------------------------------------------------

test('protected routes return 401 without a token', async () => {
  for (const path of ['/api/students', '/api/teachers', '/api/classes', '/api/subjects', '/api/results', '/api/users']) {
    const res = await api('GET', path);
    assert.equal(res.status, 401, `${path} should require authentication`);
    assert.equal(res.json.success, false);
  }
});

test('malformed, tampered and wrongly-signed tokens return 401', async () => {
  const garbage = await api('GET', '/api/students', { token: 'not-a-jwt' });
  assert.equal(garbage.status, 401);
  assert.equal(garbage.json.code, 'TOKEN_INVALID');

  const [header, payload] = state.adminToken.split('.');
  const tampered = `${header}.${payload}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
  const tamperedRes = await api('GET', '/api/students', { token: tampered });
  assert.equal(tamperedRes.status, 401);
  assert.equal(tamperedRes.json.code, 'TOKEN_INVALID');

  // Correctly formed token signed with the wrong key.
  const otherKey = require('jsonwebtoken').sign(
    { sub: userService.findByEmail(ADMIN.email).id, role: 'admin' },
    'a-completely-different-signing-secret',
    { algorithm: 'HS256', issuer: 'school-management-system', audience: 'school-management-api', expiresIn: '1h' }
  );
  const forged = await api('GET', '/api/students', { token: otherKey });
  assert.equal(forged.status, 401);
  assert.equal(forged.json.code, 'TOKEN_INVALID');
});

test('an inactive account is rejected with 403', async () => {
  const created = await api('POST', '/api/auth/register', {
    body: { name: 'Dormant', email: 'dormant@school.test', password: 'StrongPass1' },
  });
  const token = created.json.data.token;
  const userId = created.json.data.user.id;

  const deactivated = await api('PUT', `/api/users/${userId}`, {
    token: state.adminToken,
    body: { status: 'inactive' },
  });
  assert.equal(deactivated.status, 200);

  const res = await api('GET', '/api/students/me', { token });
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'ACCOUNT_INACTIVE');
});

test('a token for a deleted user is rejected', async () => {
  const created = await api('POST', '/api/auth/register', {
    body: { name: 'Ghost User', email: 'ghost.user@school.test', password: 'StrongPass1' },
  });
  const token = created.json.data.token;

  const deleted = await api('DELETE', `/api/users/${created.json.data.user.id}`, { token: state.adminToken });
  assert.equal(deleted.status, 200);

  const res = await api('GET', '/api/students/me', { token });
  assert.equal(res.status, 401);
  assert.equal(res.json.code, 'USER_NOT_FOUND');
});

// ---------------------------------------------------------------------------
// Authorization -> 403
// ---------------------------------------------------------------------------

test('a teacher cannot manage students, teachers, classes, subjects or users', async () => {
  const attempts = [
    ['POST', '/api/students', { name: 'X', email: 'x@school.test' }],
    ['PUT', `/api/students/${state.studentId}`, { name: 'Renamed' }],
    ['DELETE', `/api/students/${state.studentId}`, undefined],
    ['POST', '/api/teachers', { name: 'X', email: 'xt@school.test' }],
    ['DELETE', `/api/teachers/${state.teacherId}`, undefined],
    ['POST', '/api/classes', { name: 'X', gradeLevel: 1 }],
    ['POST', '/api/subjects', { name: 'X', code: 'XXX999' }],
    ['GET', '/api/users', undefined],
    ['POST', '/api/users', { name: 'X', email: 'xu@school.test', password: 'StrongPass1', role: 'admin' }],
  ];

  for (const [method, path, body] of attempts) {
    const res = await api(method, path, { token: state.teacherToken, body });
    assert.equal(res.status, 403, `${method} ${path} must be forbidden for teachers (got ${res.status})`);
    assert.equal(res.json.success, false);
  }
});

test('a teacher cannot delete a result (only admin can)', async () => {
  const res = await api('DELETE', `/api/results/${state.resultId}`, { token: state.teacherToken });
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'INSUFFICIENT_ROLE');
});

test('a student cannot write any school record', async () => {
  const attempts = [
    ['POST', '/api/students', { name: 'X', email: 'xs@school.test' }],
    ['PUT', `/api/students/${state.studentId}`, { name: 'Hacked' }],
    ['DELETE', `/api/students/${state.studentId}`, undefined],
    ['POST', '/api/teachers', { name: 'X', email: 'xst@school.test' }],
    ['POST', '/api/classes', { name: 'X', gradeLevel: 1 }],
    ['PUT', `/api/classes/${state.classId}`, { name: 'Hacked' }],
    ['POST', '/api/subjects', { name: 'X', code: 'XXX998' }],
    ['POST', '/api/results', { studentId: state.studentId, subjectId: state.subjectId, score: 90, term: 'first', session: '2025/2026' }],
    ['GET', '/api/users', undefined],
    ['GET', '/api/students', undefined],
    ['GET', '/api/classes', undefined],
  ];

  for (const [method, path, body] of attempts) {
    const res = await api(method, path, { token: state.studentToken, body });
    assert.equal(res.status, 403, `${method} ${path} must be forbidden for students (got ${res.status})`);
  }
});

test('a student cannot read the school-wide student list but can read their own profile', async () => {
  const list = await api('GET', '/api/students', { token: state.studentToken });
  assert.equal(list.status, 403);

  const me = await api('GET', '/api/students/me', { token: state.studentToken });
  assert.equal(me.status, 200);
  assert.equal(me.json.data.id, state.studentId);
  assert.equal(me.json.data.email, STUDENT.email);
});

test('a student cannot read another student record or result (403, not 404)', async () => {
  const other = db.findAll('students').find((s) => s.id !== state.studentId);

  const profile = await api('GET', `/api/students/${other.id}`, { token: state.studentToken });
  assert.equal(profile.status, 403);
  assert.equal(profile.json.code, 'NOT_STUDENT_OWNER');

  const foreignResult = db.findOne('results', (r) => r.studentId !== state.studentId);
  const result = await api('GET', `/api/results/${foreignResult.id}`, { token: state.studentToken });
  assert.equal(result.status, 403);
  assert.equal(result.json.code, 'NOT_RESULT_OWNER');
});

test('a student cannot read a class they do not belong to', async () => {
  const res = await api('GET', `/api/classes/${state.otherClassId}`, { token: state.studentToken });
  assert.equal(res.status, 403);
  assert.equal(res.json.code, 'NOT_CLASS_MEMBER');
});

test('an admin cannot delete or demote their own account', async () => {
  const adminId = userService.findByEmail(ADMIN.email).id;

  const selfDelete = await api('DELETE', `/api/users/${adminId}`, { token: state.adminToken });
  assert.equal(selfDelete.status, 400);
  assert.equal(selfDelete.json.code, 'SELF_DELETION');

  const selfDemote = await api('PUT', `/api/users/${adminId}`, {
    token: state.adminToken,
    body: { role: 'student' },
  });
  assert.equal(selfDemote.status, 400);
  assert.equal(selfDemote.json.code, 'SELF_ROLE_CHANGE');
});

// ---------------------------------------------------------------------------
// Students CRUD
// ---------------------------------------------------------------------------

test('admin performs the full student CRUD cycle', async () => {
  const created = await api('POST', '/api/students', {
    token: state.adminToken,
    body: {
      name: 'Created Student',
      email: 'created.student@school.test',
      phone: '+2348030000001',
      classId: state.classId,
      gender: 'female',
    },
  });
  assert.equal(created.status, 201, created.text);
  assert.ok(created.json.data.id);
  assert.ok(created.json.data.createdAt);
  assert.equal(created.json.data.class.id, state.classId, 'class is expanded from the foreign key');
  const studentId = created.json.data.id;
  state.otherStudentId = studentId;

  const list = await api('GET', '/api/students?limit=100', { token: state.adminToken });
  assert.equal(list.status, 200);
  assert.ok(list.json.data.some((s) => s.id === studentId));
  assert.ok(list.json.meta.total > 0);
  assert.equal(list.json.meta.limit, 100);

  const one = await api('GET', `/api/students/${studentId}`, { token: state.adminToken });
  assert.equal(one.status, 200);
  assert.equal(one.json.data.email, 'created.student@school.test');

  const updated = await api('PUT', `/api/students/${studentId}`, {
    token: state.adminToken,
    body: { name: 'Updated Student', phone: '+2348030000009' },
  });
  assert.equal(updated.status, 200, updated.text);
  assert.equal(updated.json.data.name, 'Updated Student');
  assert.equal(updated.json.data.phone, '+2348030000009');

  const removed = await api('DELETE', `/api/students/${studentId}`, { token: state.adminToken });
  assert.equal(removed.status, 200);
  assert.equal(removed.json.data.id, studentId);

  const gone = await api('GET', `/api/students/${studentId}`, { token: state.adminToken });
  assert.equal(gone.status, 404);
  assert.equal(gone.json.code, 'STUDENT_NOT_FOUND');
});

test('student list supports search, sorting and pagination', async () => {
  const page = await api('GET', '/api/students?page=1&limit=2&sortBy=name&order=asc', { token: state.adminToken });
  assert.equal(page.status, 200);
  assert.equal(page.json.data.length, 2);
  assert.equal(page.json.meta.page, 1);
  assert.ok(page.json.meta.totalPages >= 1);

  const sorted = page.json.data.map((s) => s.name);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a.localeCompare(b, 'en')));

  const search = await api('GET', '/api/students?search=amina', { token: state.adminToken });
  assert.equal(search.status, 200);
  assert.ok(search.json.data.every((s) => /amina/i.test(s.name + s.email)));
});

test('student validation rejects bad phone, gender, classId and unknown fields', async () => {
  const badPhone = await api('POST', '/api/students', {
    token: state.adminToken,
    body: { name: 'Bad Phone', email: 'badphone@school.test', phone: 'not-a-phone' },
  });
  assert.equal(badPhone.status, 400);
  assert.ok(badPhone.json.errors.some((e) => e.field === 'phone'));

  const badGender = await api('POST', '/api/students', {
    token: state.adminToken,
    body: { name: 'Bad Gender', email: 'badgender@school.test', gender: 'unknown' },
  });
  assert.equal(badGender.status, 400);

  const badClass = await api('POST', '/api/students', {
    token: state.adminToken,
    body: { name: 'Bad Class', email: 'badclass@school.test', classId: 'not-a-uuid' },
  });
  assert.equal(badClass.status, 400);

  const unknownField = await api('POST', '/api/students', {
    token: state.adminToken,
    body: { name: 'Unknown Field', email: 'unknownfield@school.test', role: 'admin' },
  });
  assert.equal(unknownField.status, 400);
  assert.match(unknownField.json.errors[0].message, /Unexpected field/);

  const emptyUpdate = await api('PUT', `/api/students/${state.studentId}`, {
    token: state.adminToken,
    body: {},
  });
  assert.equal(emptyUpdate.status, 400);
  assert.match(emptyUpdate.json.errors[0].message, /At least one field/);
});

test('a syntactically invalid id returns 400 and an unknown id returns 404', async () => {
  const malformed = await api('GET', '/api/students/not-a-uuid', { token: state.adminToken });
  assert.equal(malformed.status, 400);
  assert.match(malformed.json.errors[0].message, /valid UUID/);

  const unknown = await api('GET', '/api/students/11111111-2222-4333-8444-555555555555', {
    token: state.adminToken,
  });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.json.message, 'Student not found: 11111111-2222-4333-8444-555555555555');
});

test('a duplicate student email returns 409', async () => {
  const res = await api('POST', '/api/students', {
    token: state.adminToken,
    body: { name: 'Copy Cat', email: STUDENT.email },
  });
  assert.equal(res.status, 409);
});

test('creating a student with a non-existent class is rejected', async () => {
  const res = await api('POST', '/api/students', {
    token: state.adminToken,
    body: { name: 'Orphan', email: 'orphan@school.test', classId: '11111111-2222-4333-8444-555555555555' },
  });

  assert.equal(res.status, 400);
  assert.match(res.json.message, /Referenced class/);
});

// ---------------------------------------------------------------------------
// Teachers, classes, subjects CRUD
// ---------------------------------------------------------------------------

test('admin performs the full teacher CRUD cycle', async () => {
  const created = await api('POST', '/api/teachers', {
    token: state.adminToken,
    body: { name: 'New Teacher', email: 'new.teacher@school.test', phone: '+2348040000001', subject: 'Geography' },
  });
  assert.equal(created.status, 201, created.text);
  const teacherId = created.json.data.id;

  const list = await api('GET', '/api/teachers', { token: state.adminToken });
  assert.ok(list.json.data.some((t) => t.id === teacherId));

  const updated = await api('PUT', `/api/teachers/${teacherId}`, {
    token: state.adminToken,
    body: { subject: 'History' },
  });
  assert.equal(updated.json.data.subject, 'History');

  const removed = await api('DELETE', `/api/teachers/${teacherId}`, { token: state.adminToken });
  assert.equal(removed.status, 200);
  assert.equal((await api('GET', `/api/teachers/${teacherId}`, { token: state.adminToken })).status, 404);
});

test('a teacher reads their own profile at /api/teachers/me', async () => {
  const res = await api('GET', '/api/teachers/me', { token: state.teacherToken });

  assert.equal(res.status, 200);
  assert.equal(res.json.data.userId, userService.findByEmail(TEACHER.email).id);
  assert.equal(res.json.data.email, TEACHER.email);
});

test('admin performs the full class CRUD cycle and links a form teacher', async () => {
  const created = await api('POST', '/api/classes', {
    token: state.adminToken,
    body: { name: 'SSS 3 - Epsilon', gradeLevel: 11, teacherId: state.teacherId, capacity: 35, room: 'Block F-12' },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.json.data.teacher.id, state.teacherId);
  const classId = created.json.data.id;

  const duplicate = await api('POST', '/api/classes', {
    token: state.adminToken,
    body: { name: 'sss 3 - epsilon', gradeLevel: 11 },
  });
  assert.equal(duplicate.status, 409, 'class names are unique regardless of case');

  const badGrade = await api('POST', '/api/classes', { token: state.adminToken, body: { name: 'Grade 99', gradeLevel: 99 } });
  assert.equal(badGrade.status, 400);
  assert.ok(badGrade.json.errors.some((e) => e.field === 'gradeLevel'));

  const updated = await api('PUT', `/api/classes/${classId}`, {
    token: state.adminToken,
    body: { room: 'Block G-01', capacity: 40 },
  });
  assert.equal(updated.json.data.room, 'Block G-01');

  const removed = await api('DELETE', `/api/classes/${classId}`, { token: state.adminToken });
  assert.equal(removed.status, 200);
  assert.equal((await api('GET', `/api/classes/${classId}`, { token: state.adminToken })).status, 404);
});

test('admin performs the full subject CRUD cycle', async () => {
  const created = await api('POST', '/api/subjects', {
    token: state.adminToken,
    body: { name: 'Agricultural Science', code: 'AGR101', credits: 3, description: 'Crop and animal production' },
  });
  assert.equal(created.status, 201, created.text);
  const subjectId = created.json.data.id;

  const duplicate = await api('POST', '/api/subjects', { token: state.adminToken, body: { name: 'Dup', code: 'AGR101' } });
  assert.equal(duplicate.status, 409);

  const badCode = await api('POST', '/api/subjects', { token: state.adminToken, body: { name: 'Bad', code: 'too-lowercase' } });
  assert.equal(badCode.status, 400);

  const updated = await api('PUT', `/api/subjects/${subjectId}`, { token: state.adminToken, body: { isActive: false } });
  assert.equal(updated.json.data.isActive, false);

  const inactive = await api('GET', '/api/subjects?isActive=false', { token: state.studentToken });
  assert.ok(inactive.json.data.some((s) => s.id === subjectId));

  const removed = await api('DELETE', `/api/subjects/${subjectId}`, { token: state.adminToken });
  assert.equal(removed.status, 200);
  assert.equal((await api('GET', `/api/subjects/${subjectId}`, { token: state.adminToken })).status, 404);
});

test('all three roles can read subjects, only admin can create', async () => {
  for (const token of [state.adminToken, state.teacherToken, state.studentToken]) {
    const res = await api('GET', '/api/subjects', { token });
    assert.equal(res.status, 200);
  }
});

test('a teacher can read the class list, a student can only read their own class', async () => {
  const teacherView = await api('GET', '/api/classes', { token: state.teacherToken });
  assert.equal(teacherView.status, 200);

  const studentClass = await api('GET', '/api/classes/me', { token: state.studentToken });
  assert.equal(studentClass.status, 200);
  assert.equal(studentClass.json.data.id, state.classId);

  const own = await api('GET', `/api/classes/${state.classId}`, { token: state.studentToken });
  assert.equal(own.status, 200);
});

test('a student sees their class through /api/students/me/class', async () => {
  const res = await api('GET', '/api/students/me/class', { token: state.studentToken });

  assert.equal(res.status, 200);
  assert.equal(res.json.data.id, state.classId);
  assert.ok(res.json.data.name);
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

test('a teacher creates a result and the grade is derived from the score', async () => {
  const res = await api('POST', '/api/results', {
    token: state.teacherToken,
    body: {
      studentId: state.studentId,
      subjectId: state.subjectId,
      score: 78,
      term: 'second',
      session: '2025/2026',
      remarks: 'Excellent progress',
    },
  });

  assert.equal(res.status, 201, res.text);
  assert.equal(res.json.data.grade, 'A');
  assert.equal(res.json.data.gradePoint, 5);
  assert.equal(res.json.data.remark, 'Distinction');
  assert.equal(res.json.data.student.id, state.studentId, 'student relation is resolved');
  assert.equal(res.json.data.subject.id, state.subjectId, 'subject relation is resolved');
  assert.equal(res.json.data.class.id, state.classId, 'class is derived from the student');
  assert.equal(res.json.data.recordedBy.role, 'teacher');
  state.resultId = res.json.data.id;
});

test('a mismatched grade in the payload is rejected', async () => {
  const res = await api('POST', '/api/results', {
    token: state.teacherToken,
    body: {
      studentId: state.studentId,
      subjectId: state.subjectId,
      score: 30,
      grade: 'A',
      term: 'third',
      session: '2025/2026',
    },
  });

  assert.equal(res.status, 400);
  assert.match(res.json.errors[0].message, /inconsistent with score/);
});

test('a duplicate result for the same student/subject/term/session is rejected', async () => {
  const res = await api('POST', '/api/results', {
    token: state.teacherToken,
    body: {
      studentId: state.studentId,
      subjectId: state.subjectId,
      score: 55,
      term: 'second',
      session: '2025/2026',
    },
  });

  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'DUPLICATE_RESULT');
});

test('result score, term, session and foreign keys are validated', async () => {
  const base = { studentId: state.studentId, subjectId: state.subjectId, score: 50, term: 'first', session: '2025/2026' };

  const highScore = await api('POST', '/api/results', { token: state.teacherToken, body: { ...base, score: 150 } });
  assert.equal(highScore.status, 400);
  assert.ok(highScore.json.errors.some((e) => e.field === 'score'));

  const negative = await api('POST', '/api/results', { token: state.teacherToken, body: { ...base, score: -5 } });
  assert.equal(negative.status, 400);

  const badTerm = await api('POST', '/api/results', { token: state.teacherToken, body: { ...base, term: 'fourth' } });
  assert.equal(badTerm.status, 400);
  assert.ok(badTerm.json.errors.some((e) => e.field === 'term'));

  const badSession = await api('POST', '/api/results', { token: state.teacherToken, body: { ...base, session: '2025' } });
  assert.equal(badSession.status, 400);
  assert.ok(badSession.json.errors.some((e) => e.field === 'session'));

  const badStudent = await api('POST', '/api/results', {
    token: state.teacherToken,
    body: { ...base, studentId: '11111111-2222-4333-8444-555555555555' },
  });
  assert.equal(badStudent.status, 400);
  assert.match(badStudent.json.message, /Referenced student/);
});

test('a teacher updates a result and the grade is recalculated', async () => {
  const res = await api('PUT', `/api/results/${state.resultId}`, {
    token: state.teacherToken,
    body: { score: 42 },
  });

  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.data.score, 42);
  assert.equal(res.json.data.grade, 'F');
  assert.equal(res.json.data.remark, 'Fail');
});

test('admin deletes a result', async () => {
  const created = await api('POST', '/api/results', {
    token: state.adminToken,
    body: { studentId: state.studentId, subjectId: state.subjectId, score: 65, term: 'third', session: '2024/2025' },
  });
  assert.equal(created.status, 201);

  const removed = await api('DELETE', `/api/results/${created.json.data.id}`, { token: state.adminToken });
  assert.equal(removed.status, 200);
  assert.equal((await api('GET', `/api/results/${created.json.data.id}`, { token: state.adminToken })).status, 404);
});

test('a student only ever sees their own results', async () => {
  const res = await api('GET', '/api/results?limit=100', { token: state.studentToken });

  assert.equal(res.status, 200);
  assert.ok(res.json.data.length > 0);
  assert.ok(
    res.json.data.every((r) => r.studentId === state.studentId),
    'result list is scoped to the authenticated student'
  );

  // Attempting to widen the scope via the query string must not work.
  const other = db.findAll('students').find((s) => s.id !== state.studentId);
  const spoofed = await api('GET', `/api/results?studentId=${other.id}&limit=100`, { token: state.studentToken });
  assert.ok(spoofed.json.data.every((r) => r.studentId === state.studentId));
});

test('results can be filtered by student, subject, term and grade for staff', async () => {
  const byStudent = await api('GET', `/api/results?studentId=${state.studentId}&limit=100`, {
    token: state.adminToken,
  });
  assert.ok(byStudent.json.data.every((r) => r.studentId === state.studentId));

  const byGrade = await api('GET', '/api/results?grade=A&limit=100', { token: state.teacherToken });
  assert.ok(byGrade.json.data.every((r) => r.grade === 'A'));

  const badGrade = await api('GET', '/api/results?grade=Z', { token: state.teacherToken });
  assert.equal(badGrade.status, 400);

  const badRange = await api('GET', '/api/results?minScore=80&maxScore=20', { token: state.teacherToken });
  assert.equal(badRange.status, 400);
});

// ---------------------------------------------------------------------------
// User administration
// ---------------------------------------------------------------------------

test('admin manages user accounts and roles', async () => {
  const created = await api('POST', '/api/users', {
    token: state.adminToken,
    body: { name: 'Vice Principal', email: 'vice@school.test', password: 'StrongPass1', role: 'admin' },
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.json.data.role, 'admin');
  assert.equal(created.json.data.passwordHash, undefined);

  const list = await api('GET', '/api/users?role=admin', { token: state.adminToken });
  assert.ok(list.json.data.every((u) => u.role === 'admin'));
  assert.ok(list.json.data.every((u) => u.passwordHash === undefined));

  const promoted = await api('PUT', `/api/users/${created.json.data.id}`, {
    token: state.adminToken,
    body: { role: 'teacher' },
  });
  assert.equal(promoted.json.data.role, 'teacher');

  const badRole = await api('PUT', `/api/users/${created.json.data.id}`, {
    token: state.adminToken,
    body: { role: 'wizard' },
  });
  assert.equal(badRole.status, 400);

  const weakPassword = await api('PUT', `/api/users/${created.json.data.id}`, {
    token: state.adminToken,
    body: { password: 'short' },
  });
  assert.equal(weakPassword.status, 400);

  const removed = await api('DELETE', `/api/users/${created.json.data.id}`, { token: state.adminToken });
  assert.equal(removed.status, 200);
});

// ---------------------------------------------------------------------------
// Cross-cutting guarantees
// ---------------------------------------------------------------------------

test('no response body anywhere leaks a password or hash', async () => {
  const requests = [
    ['GET', '/api/health'],
    ['GET', '/api/auth/me', state.studentToken],
    ['GET', '/api/users', state.adminToken],
    ['GET', '/api/students?limit=100', state.adminToken],
    ['GET', '/api/teachers', state.adminToken],
    ['GET', '/api/classes', state.adminToken],
    ['GET', '/api/subjects', state.adminToken],
    ['GET', '/api/results?limit=100', state.adminToken],
  ];

  for (const [method, path, token] of requests) {
    const res = await api(method, path, { token });
    assert.ok(!res.text.includes('passwordHash'), `${path} must not contain passwordHash`);
    assert.ok(!res.text.includes('$2b$'), `${path} must not contain a bcrypt hash`);
  }
});

test('security headers are present and the framework is not advertised', async () => {
  const res = await api('GET', '/api/health');

  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy'));
  assert.ok(res.headers.get('x-request-id'));
});

test('the request logger stamps each request with method, url, status and id', async () => {
  // The logger writes to stdout; assert the middleware tagged the request.
  const res = await api('GET', '/api/health');
  assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
});
