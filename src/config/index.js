'use strict';

/**
 * Application configuration.
 *
 * Every tunable value is read from the environment (`.env`), validated once at
 * boot and frozen. Nothing in the codebase reads `process.env` directly, so a
 * mis-configured deployment fails fast with a readable message instead of
 * silently falling back to defaults at runtime.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const envFiles = [path.join(ROOT_DIR, '.env'), path.join(ROOT_DIR, `.env.${NODE_ENV}`)];
const envFile = envFiles.find((file) => fs.existsSync(file));

if (envFile) {
  // `quiet` silences dotenv's startup banner. Existing process env wins, which
  // is what lets the test-suite raise rate limits without touching .env.
  dotenv.config({ path: envFile, quiet: true });
}

const problems = [];

function requireString(name, { min = 1 } = {}) {
  const value = (process.env[name] || '').trim();
  if (value.length < min) problems.push(`${name} is required (min length ${min})`);
  return value;
}

function readString(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value.trim();
}

function readInt(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name} must be an integer between ${min} and ${max} (received "${raw}")`);
    return fallback;
  }
  return value;
}

function readChoice(name, fallback, allowed) {
  const value = readString(name, fallback).toLowerCase();
  if (!allowed.includes(value)) {
    problems.push(`${name} must be one of: ${allowed.join(', ')} (received "${value}")`);
    return fallback;
  }
  return value;
}

function readList(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const PLACEHOLDER_SECRET_MARKERS = ['change-me', 'your-secret', 'replace-me', 'secret123'];

// --- Required secrets ---------------------------------------------------------
const jwtSecret = requireString('JWT_SECRET', { min: 16 });
if (jwtSecret && PLACEHOLDER_SECRET_MARKERS.some((marker) => jwtSecret.toLowerCase().includes(marker))) {
  problems.push('JWT_SECRET still contains a placeholder value. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}

const env = Object.freeze({
  rootDir: ROOT_DIR,
  nodeEnv: NODE_ENV,
  isProduction,
  isTest,
  isDevelopment: NODE_ENV === 'development',
  port: readInt('PORT', 4000, { min: 1, max: 65535 }),
  apiPrefix: readString('API_PREFIX', '/api').replace(/\/+$/, ''),
  corsOrigins: readList('CORS_ORIGIN', ['*']),
  logFormat: readChoice('LOG_FORMAT', 'dev', ['dev', 'combined', 'tiny']),
  logLevel: readChoice('LOG_LEVEL', 'info', ['error', 'warn', 'info', 'debug']),
  logSilent: readList('LOG_SILENT', []).map((v) => v.toLowerCase())[0] === 'true' || isTest,
  trustProxyHops: readInt('TRUST_PROXY_HOPS', 0, { min: 0, max: 10 }),

  jwt: Object.freeze({
    secret: jwtSecret,
    algorithm: 'HS256',
    expiresIn: readString('JWT_EXPIRES_IN', '1h'),
    issuer: readString('JWT_ISSUER', 'school-management-system'),
    audience: readString('JWT_AUDIENCE', 'school-management-api'),
  }),

  password: Object.freeze({
    saltRounds: readInt('BCRYPT_SALT_ROUNDS', 10, { min: 4, max: 15 }),
    minLength: readInt('PASSWORD_MIN_LENGTH', 8, { min: 8, max: 64 }),
    // bcrypt silently truncates at 72 bytes; refuse longer input instead of
    // accepting a password that is not really the one being checked.
    maxLength: Math.min(readInt('PASSWORD_MAX_LENGTH', 72, { min: 16, max: 200 }), 72),
  }),

  rateLimit: Object.freeze({
    auth: Object.freeze({
      windowMs: readInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, { min: 1000 }),
      max: readInt('AUTH_RATE_LIMIT_MAX', 20, { min: 1 }),
    }),
    login: Object.freeze({
      windowMs: readInt('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, { min: 1000 }),
      max: readInt('LOGIN_RATE_LIMIT_MAX', 10, { min: 1 }),
    }),
    global: Object.freeze({
      windowMs: readInt('GLOBAL_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000, { min: 1000 }),
      max: readInt('GLOBAL_RATE_LIMIT_MAX', 300, { min: 1 }),
    }),
  }),

  seed: Object.freeze({
    enabled: readString('SEED_DATA', 'true').toLowerCase() !== 'false',
    counts: Object.freeze({
      students: readInt('SEED_STUDENTS', 6, { min: 0, max: 500 }),
      teachers: readInt('SEED_TEACHERS', 4, { min: 0, max: 500 }),
      classes: readInt('SEED_CLASSES', 4, { min: 0, max: 500 }),
      subjects: readInt('SEED_SUBJECTS', 8, { min: 0, max: 500 }),
      results: readInt('SEED_RESULTS', 30, { min: 0, max: 5000 }),
    }),
  }),

  bootstrapAdmin: Object.freeze({
    name: readString('ADMIN_NAME', 'System Administrator'),
    email: (readString('ADMIN_EMAIL', 'admin@school.test') || '').toLowerCase(),
    password: readString('ADMIN_PASSWORD', ''),
    // Demo credentials for teacher/student accounts created by the seeder.
    demo: Object.freeze({
      teacherEmail: 'teacher@school.test',
      teacherPassword: 'Teacher@12345',
      studentEmail: 'student@school.test',
      studentPassword: 'Student@12345',
    }),
  }),

  jsonBodyLimit: readString('JSON_BODY_LIMIT', '20kb'),
});

if (!env.bootstrapAdmin.password && env.seed.enabled) {
  problems.push('ADMIN_PASSWORD is required to bootstrap the first administrator');
}

if (problems.length > 0) {
  const error = new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  error.code = 'ENV_CONFIG_INVALID';
  throw error;
}

module.exports = env;
