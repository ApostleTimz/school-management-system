'use strict';

/**
 * Grading scale (Nigeria-style 5-point, matching the common WAEC/NECO banding).
 * `min` is inclusive and the bands are evaluated from the top down.
 */
const GRADE_SCALE = Object.freeze([
  Object.freeze({ grade: 'A', min: 75, max: 100, gradePoint: 5, remark: 'Distinction' }),
  Object.freeze({ grade: 'B', min: 60, max: 74.99, gradePoint: 4, remark: 'Merit' }),
  Object.freeze({ grade: 'C', min: 50, max: 59.99, gradePoint: 3, remark: 'Credit' }),
  Object.freeze({ grade: 'D', min: 45, max: 49.99, gradePoint: 2, remark: 'Pass' }),
  Object.freeze({ grade: 'F', min: 0, max: 44.99, gradePoint: 0, remark: 'Fail' }),
]);

const GRADES = Object.freeze(GRADE_SCALE.map((band) => band.grade));

/** Derives the letter grade, grade point and remark from a 0-100 score. */
function computeGrade(score) {
  const numeric = Number(score);
  const band = GRADE_SCALE.find((entry) => numeric >= entry.min && numeric <= entry.max);
  if (!band) return { grade: 'F', gradePoint: 0, remark: 'Fail' };
  return { grade: band.grade, gradePoint: band.gradePoint, remark: band.remark };
}

module.exports = { GRADE_SCALE, GRADES, computeGrade };
