'use strict';

const asyncHandler = require('../utils/async-handler');
const { sendSuccess, sendCreated } = require('../utils/response');
const authService = require('../services/auth.service');
const userService = require('../services/user.service');
const studentService = require('../services/student.service');
const teacherService = require('../services/teacher.service');
const env = require('../config');

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { user, profile, token } = await authService.register(req.body);

  const data = {
    user: userService.toPublicUser(user),
    token,
    tokenType: 'Bearer',
    expiresIn: env.jwt.expiresIn,
  };

  if (profile) {
    data.profile =
      user.role === 'student' ? studentService.toStudentView(profile) : teacherService.toTeacherView(profile);
  }

  return sendCreated(res, data, 'Account registered successfully');
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body);
  return sendSuccess(res, {
    message: 'Login successful',
    data: session,
  });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const data = { user: req.user };

  if (req.user.role === 'student') {
    data.profile = studentService.toStudentView(studentService.resolveProfileForUser(req.user));
  } else if (req.user.role === 'teacher') {
    data.profile = teacherService.toTeacherView(teacherService.resolveProfileForUser(req.user));
  }

  return sendSuccess(res, { message: 'Authenticated user', data });
});

/** POST /api/auth/change-password */
const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user, req.body);
  return sendSuccess(res, { message: 'Password changed successfully' });
});

/** POST /api/auth/logout (stateless JWT: the client discards the token) */
const logout = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    message: 'Logged out. The client must discard the access token.',
    data: null,
  });
});

module.exports = { register, login, me, changePassword, logout };
