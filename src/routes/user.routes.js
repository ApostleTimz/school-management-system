'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { adminOnly } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const validators = require('../validators/user.validator');
const controller = require('../controllers/user.controller');

const router = express.Router();

/**
 * Account administration.
 *
 * Every route is admin-only: this is the surface that manages administrators, so
 * a teacher hitting GET /api/users receives 403 rather than a user list.
 */
router.use(authenticate, adminOnly);

router.get('/', validate(validators.list), controller.list);
router.post('/', validate(validators.create), controller.create);
router.get('/:id', validate(validators.id), controller.getOne);
router.put('/:id', validate(validators.id), validate(validators.update), controller.update);
router.delete('/:id', validate(validators.id), controller.remove);

module.exports = router;
