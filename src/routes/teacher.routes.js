'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { adminOnly, authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');
const validate = require('../middleware/validate');
const validators = require('../validators/teacher.validator');
const controller = require('../controllers/teacher.controller');

const router = express.Router();

router.use(authenticate);

// --- Teacher self-service (teacher role only) -------------------------------
router.get('/me', authorize(ROLES.TEACHER), controller.myProfile);

// --- Collection (admin only) -------------------------------------------------
// Teachers can view students, classes and subjects; the staff directory itself
// is administrative data, so it is restricted to administrators.
router.get('/', adminOnly, validate(validators.list), controller.list);
router.post('/', adminOnly, validate(validators.create), controller.create);

// --- Item (admin only) -------------------------------------------------------
router.get('/:id', adminOnly, validate(validators.id), controller.getOne);
router.put('/:id', adminOnly, validate(validators.id), validate(validators.update), controller.update);
router.delete('/:id', adminOnly, validate(validators.id), controller.remove);

module.exports = router;
