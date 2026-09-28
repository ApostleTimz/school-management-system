'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { adminOnly, staffOnly, allRoles } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const validators = require('../validators/result.validator');
const controller = require('../controllers/result.controller');

const router = express.Router();

router.use(authenticate);

/**
 * Results are the one collection teachers may write to:
 *   admin   - create / view / update / delete
 *   teacher - create / view / update  (no delete)
 *   student - view their own results only
 */
router.get('/', allRoles, validate(validators.list), controller.list);
router.post('/', staffOnly, validate(validators.create), controller.create);

router.get('/:id', allRoles, validate(validators.id), controller.getOne);
router.put('/:id', staffOnly, validate(validators.id), validate(validators.update), controller.update);
router.delete('/:id', adminOnly, validate(validators.id), controller.remove);

module.exports = router;
