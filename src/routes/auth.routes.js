'use strict';

const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { allRoles } = require('../middleware/authorize');
const { authLimiter, loginLimiter } = require('../middleware/rate-limit');
const validate = require('../middleware/validate');
const authValidators = require('../validators/auth.validator');
const authController = require('../controllers/auth.controller');

const router = express.Router();

/**
 * Public endpoints, protected by the brute-force rate limiter.
 *
 * POST /api/auth/register  -> self-service signup (student or teacher only)
 * POST /api/auth/login     -> exchange credentials for a JWT
 */
router.post('/register', authLimiter, validate(authValidators.register), authController.register);
router.post('/login', authLimiter, loginLimiter, validate(authValidators.login), authController.login);

/** Authenticated endpoints. */
router.use(authenticate);

router.get('/me', allRoles, authController.me);
router.post('/change-password', authLimiter, validate(authValidators.changePassword), authController.changePassword);
router.post('/logout', allRoles, authController.logout);

module.exports = router;
