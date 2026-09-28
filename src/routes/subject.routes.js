'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { adminOnly, allRoles } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const validators = require('../validators/subject.validator');
const controller = require('../controllers/subject.controller');

const router = express.Router();

router.use(authenticate);

// Every authenticated role may read the curriculum; only admins may change it.
router.get('/', allRoles, validate(validators.list), controller.list);
router.post('/', adminOnly, validate(validators.create), controller.create);

router.get('/:id', allRoles, validate(validators.id), controller.getOne);
router.put('/:id', adminOnly, validate(validators.id), validate(validators.update), controller.update);
router.delete('/:id', adminOnly, validate(validators.id), controller.remove);

module.exports = router;
