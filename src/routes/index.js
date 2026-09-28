'use strict';

const express = require('express');

const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const studentRoutes = require('./student.routes');
const teacherRoutes = require('./teacher.routes');
const classRoutes = require('./class.routes');
const subjectRoutes = require('./subject.routes');
const resultRoutes = require('./result.routes');

const router = express.Router();

/** Liveness probe - intentionally public. */
router.use('/health', healthRoutes);

/** Authentication (register / login are public; the rest require a token). */
router.use('/auth', authRoutes);

/** Administrator-only account management. */
router.use('/users', userRoutes);

router.use('/students', studentRoutes);
router.use('/teachers', teacherRoutes);
router.use('/classes', classRoutes);
router.use('/subjects', subjectRoutes);
router.use('/results', resultRoutes);

module.exports = router;
