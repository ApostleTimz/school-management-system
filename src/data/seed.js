'use strict';

const db = require('./db');
const env = require('../config');
const logger = require('../utils/logger');
const { newId } = require('../utils/ids');
const { hashPassword } = require('../utils/password');
const { computeGrade } = require('../utils/grade');
const { ROLES, TERMS } = require('../constants/roles');

/**
 * Seeds the in-memory database with a small, fully related dataset:
 *
 *   users ──(userId)──> students / teachers
 *   students ──(classId)──> classes ──(teacherId)──> teachers
 *   results ──(studentId)──> students
 *   results ──(subjectId)──> subjects
 */

const SUBJECTS = [
  { name: 'Mathematics', code: 'MTH101', description: 'General mathematics, algebra and geometry' },
  { name: 'English Language', code: 'ENG101', description: 'Comprehension, grammar and essay writing' },
  { name: 'Physics', code: 'PHY101', description: 'Mechanics, waves and electricity' },
  { name: 'Chemistry', code: 'CHM101', description: 'Matter, elements and chemical reactions' },
  { name: 'Biology', code: 'BIO101', description: 'Cells, genetics and ecology' },
  { name: 'Computer Science', code: 'CSC101', description: 'Programming fundamentals and algorithms' },
  { name: 'History', code: 'HIS101', description: 'Nigeria and world history' },
  { name: 'Physical Education', code: 'PED101', description: 'Athletics, games and health education' },
];

const TEACHERS = [
  { name: 'Ada Obi', email: 'ada.obi@school.test', phone: '+2348010000001', subject: 'Mathematics' },
  { name: 'Bello Musa', email: 'bello.musa@school.test', phone: '+2348010000002', subject: 'Physics' },
  { name: 'Chioma Eze', email: 'chioma.eze@school.test', phone: '+2348010000003', subject: 'English Language' },
  { name: 'Danjuma Yusuf', email: 'danjuma.yusuf@school.test', phone: '+2348010000004', subject: 'Computer Science' },
];

const CLASSES = [
  { name: 'JSS 1 - Alpha', gradeLevel: 7, description: 'Junior secondary year one, alpha stream' },
  { name: 'JSS 2 - Beta', gradeLevel: 8, description: 'Junior secondary year two, beta stream' },
  { name: 'SSS 1 - Gamma', gradeLevel: 9, description: 'Senior secondary year one, gamma stream' },
  { name: 'SSS 2 - Delta', gradeLevel: 10, description: 'Senior secondary year two, delta stream' },
];

const STUDENTS = [
  { name: 'Amina Yusuf', email: 'amina.yusuf@school.test', phone: '+2348020000001', classIndex: 0 },
  { name: 'Babatunde Ojo', email: 'babatunde.ojo@school.test', phone: '+2348020000002', classIndex: 0 },
  { name: 'Chinaza Iwu', email: 'chinaza.iwu@school.test', phone: '+2348020000003', classIndex: 1 },
  { name: 'David Bassey', email: 'david.bassey@school.test', phone: '+2348020000004', classIndex: 1 },
  { name: 'Esther Nwosu', email: 'esther.nwosu@school.test', phone: '+2348020000005', classIndex: 2 },
  { name: 'Fatima Sani', email: 'fatima.sani@school.test', phone: '+2348020000006', classIndex: 3 },
];

const SESSION = '2025/2026';

/** Small deterministic PRNG so a reseed produces comparable data. */
function createRandom(seed = 42) {
  let state = seed;
  return function random() {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

async function createUser({ name, email, password, role, status = 'active' }) {
  return db.insert('users', {
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    status,
    lastLoginAt: null,
  });
}

async function seedDatabase() {
  db.reset();

  const { students, teachers, classes, subjects, results } = env.seed.counts;

  const subjectRecords = SUBJECTS.slice(0, subjects).map((subject) =>
    db.insert('subjects', { ...subject, credits: 3, isActive: true })
  );

  const teacherRecords = TEACHERS.slice(0, teachers).map((teacher) =>
    db.insert('teachers', { ...teacher, userId: null, status: 'active' })
  );

  const classRecords = CLASSES.slice(0, classes).map((klass, index) =>
    db.insert('classes', {
      ...klass,
      capacity: 40,
      // Rotate through the seeded teachers so every class has a form teacher.
      teacherId: teacherRecords.length > 0 ? teacherRecords[index % teacherRecords.length].id : null,
      room: `Block ${String.fromCharCode(65 + (index % 6))}-${10 + index}`,
    })
  );

  const studentRecords = STUDENTS.slice(0, students).map((student) =>
    db.insert('students', {
      name: student.name,
      email: student.email,
      phone: student.phone,
      classId: classRecords.length > 0 ? classRecords[student.classIndex % classRecords.length].id : null,
      userId: null,
      gender: 'unspecified',
      status: 'active',
    })
  );

  // --- Accounts -------------------------------------------------------------
  // The bootstrap administrator comes from the environment so credentials are
  // never hard-coded in the repository.
  let admin = db.findOne('users', (user) => user.role === ROLES.ADMIN);
  if (!admin) {
    admin = await createUser({
      name: env.bootstrapAdmin.name,
      email: env.bootstrapAdmin.email,
      password: env.bootstrapAdmin.password,
      role: ROLES.ADMIN,
    });
  }

  // Demo teacher + student accounts, linked to their profile records so the
  // "view my own profile" flows can be tested straight after boot. The profile
  // email is aligned with the account email so the demo data reads coherently.
  const demoTeacher = teacherRecords[0];
  if (demoTeacher) {
    const user = await createUser({
      name: demoTeacher.name,
      email: env.bootstrapAdmin.demo.teacherEmail,
      password: env.bootstrapAdmin.demo.teacherPassword,
      role: ROLES.TEACHER,
    });
    db.updateById('teachers', demoTeacher.id, { userId: user.id, email: user.email });
    demoTeacher.userId = user.id;
    demoTeacher.email = user.email;
  }

  const demoStudent = studentRecords[0];
  if (demoStudent) {
    const user = await createUser({
      name: demoStudent.name,
      email: env.bootstrapAdmin.demo.studentEmail,
      password: env.bootstrapAdmin.demo.studentPassword,
      role: ROLES.STUDENT,
    });
    db.updateById('students', demoStudent.id, { userId: user.id, email: user.email });
    demoStudent.userId = user.id;
    demoStudent.email = user.email;
  }

  // --- Results --------------------------------------------------------------
  const random = createRandom();
  const maxResults = Math.min(
    env.seed.counts.results,
    studentRecords.length * subjectRecords.length * TERMS.length
  );

  for (let i = 0; i < maxResults; i += 1) {
    const student = studentRecords[i % studentRecords.length];
    const subject = subjectRecords[Math.floor(i / studentRecords.length) % subjectRecords.length];
    if (!student || !subject) break;

    const score = Math.round(random() * 10000) / 100; // 0 - 100, 2 decimals
    const { grade, gradePoint, remark } = computeGrade(score);

    db.insert('results', {
      studentId: student.id,
      subjectId: subject.id,
      classId: student.classId,
      score,
      grade,
      gradePoint,
      remark,
      term: TERMS[i % TERMS.length],
      session: SESSION,
      createdBy: admin.id,
    });
  }

  const summary = db.stats();
  logger.info('In-memory database seeded', summary);
  logger.info(`Demo admin    -> ${env.bootstrapAdmin.email} / ${env.bootstrapAdmin.password}`);
  if (demoTeacher) {
    logger.info(`Demo teacher  -> ${env.bootstrapAdmin.demo.teacherEmail} / ${env.bootstrapAdmin.demo.teacherPassword}`);
  }
  if (demoStudent) {
    logger.info(`Demo student  -> ${env.bootstrapAdmin.demo.studentEmail} / ${env.bootstrapAdmin.demo.studentPassword}`);
  }

  return { ...summary, session: SESSION, adminId: admin.id, newId };
}

module.exports = { seedDatabase, SESSION, SUBJECTS, TEACHERS, CLASSES, STUDENTS };
