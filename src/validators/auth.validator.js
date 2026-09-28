'use strict';

const { body } = require('express-validator');
const { SELF_REGISTER_ROLES } = require('../constants/roles');
const { rejectUnknownFields, passwordRules, lowerCase, isTrimmedString, PHONE_REGEX } = require('./common');

const REGISTER_FIELDS = ['name', 'email', 'password', 'confirmPassword', 'role', 'phone'];
const LOGIN_FIELDS = ['email', 'password'];
const CHANGE_PASSWORD_FIELDS = ['currentPassword', 'newPassword', 'confirmNewPassword'];

const register = [
  body().custom(rejectUnknownFields(REGISTER_FIELDS)),
  body('name')
    .trim()
    .bail()
    .isLength({ min: 2, max: 80 })
    .withMessage('name must be between 2 and 80 characters')
    .custom(isTrimmedString(80)),
  body('email')
    .trim()
    .bail()
    .customSanitizer(lowerCase)
    .isEmail()
    .withMessage('A valid email address is required')
    .isLength({ max: 120 })
    .withMessage('email must be at most 120 characters'),
  body('password').bail().custom(...passwordRules('password')),
  body('confirmPassword')
    .optional()
    .bail()
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('confirmPassword must match password');
      return true;
    }),
  body('role')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(SELF_REGISTER_ROLES)
    .withMessage(`role must be one of: ${SELF_REGISTER_ROLES.join(', ')} (administrators are created by an admin)`),
  body('phone').optional({ values: 'falsy' }).trim().matches(PHONE_REGEX).withMessage('phone must be a valid phone number'),
];

const login = [
  body().custom(rejectUnknownFields(LOGIN_FIELDS)),
  body('email')
    .trim()
    .bail()
    .customSanitizer(lowerCase)
    .isEmail()
    .withMessage('A valid email address is required'),
  // Deliberately only "required": applying the complexity policy on login would
  // leak information and reject legacy passwords.
  body('password').bail().isString().notEmpty().withMessage('password is required'),
];

const changePassword = [
  body().custom(rejectUnknownFields(CHANGE_PASSWORD_FIELDS)),
  body('currentPassword').bail().isString().notEmpty().withMessage('currentPassword is required'),
  body('newPassword').bail().custom(...passwordRules('newPassword')),
  body('confirmNewPassword')
    .optional({ values: 'falsy' })
    .bail()
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) throw new Error('confirmNewPassword must match newPassword');
      return true;
    }),
];

module.exports = { register, login, changePassword, REGISTER_FIELDS, LOGIN_FIELDS, CHANGE_PASSWORD_FIELDS };
