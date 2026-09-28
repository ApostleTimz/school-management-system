'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { adminOnly, staffOnly, allRoles, authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');
const validate = require('../middleware/validate');
const validators = require('../validators/student.validator');
const controller = require('../controllers/student.controller');

const router = express.Router();

router.use(authenticate);

/**
 * Students can only ever read their own record, so the self-service routes are
 * declared before /:id to keep them from being captured by the id parameter.
 */

// --- Student self-service (student role only) -------------------------------
// Restricted to the student role on purpose: for any other role the equivalent
// record lives on /api/teachers/me or /api/auth/me, and a staff account must
// not be able to materialise a student profile here.
router.get('/me', authorize(ROLES.STUDENT), controller.myProfile);
router.get('/me/class', authorize(ROLES.STUDENT), controller.myClass);
router.get('/me/results', authorize(ROLES.STUDENT), controller.myResults);

// --- Collection --------------------------------------------------------------
// Admin: full CRUD. Teacher: read-only. Student: blocked (403) - they use /me.
router.get('/', staffOnly, validate(validators.list), controller.list);
router.post('/', adminOnly, validate(validators.create), controller.create);

// --- Item --------------------------------------------------------------------
router.get('/:id', allRoles, validate(validators.id), controller.getOne);
router.put('/:id', adminOnly, validate(validators.id), validate(validators.update), controller.update);
router.delete('/:id', adminOnly, validate(validators.id), controller.remove);

module.exports = router;
