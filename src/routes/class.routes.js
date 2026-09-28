'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { adminOnly, staffOnly, allRoles, authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/roles');
const validate = require('../middleware/validate');
const validators = require('../validators/class.validator');
const controller = require('../controllers/class.controller');

const router = express.Router();

router.use(authenticate);

// --- Student self-service ---------------------------------------------------
router.get('/me', authorize(ROLES.STUDENT), controller.myClass);

// --- Collection -------------------------------------------------------------
// Admin: full CRUD. Teacher: read-only. Student: 403 (use /me).
router.get('/', staffOnly, validate(validators.list), controller.list);
router.post('/', adminOnly, validate(validators.create), controller.create);

// --- Item -------------------------------------------------------------------
router.get('/:id', allRoles, validate(validators.id), controller.getOne);
router.put('/:id', adminOnly, validate(validators.id), validate(validators.update), controller.update);
router.delete('/:id', adminOnly, validate(validators.id), controller.remove);

module.exports = router;
