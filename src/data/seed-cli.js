'use strict';

/**
 * Standalone seeding utility:  npm run seed
 *
 * The database is in-memory, so this script boots the seed routine, prints a
 * relationship report and exits. It is mainly useful for inspecting the dataset
 * (and for verifying the seeder without starting the HTTP server).
 */

const db = require('./db');
const { seedDatabase } = require('./seed');

function report() {
  const lines = ['Collection sizes:', ...Object.entries(db.stats()).map(([name, size]) => `  ${name.padEnd(9)} ${size}`)];

  const sampleStudent = db.findAll('students')[0];
  if (sampleStudent) {
    const klass = db.findById('classes', sampleStudent.classId);
    const results = db.findAll('results', (result) => result.studentId === sampleStudent.id);
    const subjects = results.map((result) => {
      const subject = db.findById('subjects', result.subjectId);
      return `${subject ? `${subject.code} (${result.score} -> ${result.grade})` : 'unknown subject'}`;
    });

    lines.push('', `Sample student: ${sampleStudent.name} <${sampleStudent.email}>`);
    lines.push(`  class:  ${klass ? klass.name : 'unassigned'}`);
    lines.push(`  results: ${results.length} -> ${subjects.join(', ') || 'none'}`);
  }

  return lines.join('\n');
}

(async () => {
  try {
    const summary = await seedDatabase();
    process.stdout.write(`${report()}\n`);
    process.stdout.write(`\nSeed complete in-memory. Session in use: ${summary.session}\n`);
    process.exit(0);
  } catch (error) {
    process.stderr.write(`Seeding failed: ${error.message}\n`);
    process.exit(1);
  }
})();
