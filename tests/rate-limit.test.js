'use strict';

/**
 * Rate limiting tests.
 *
 * The test runner executes each file in its own process, so this file can pin
 * the limits to tiny values through the environment (dotenv never overrides
 * variables that are already set) without affecting the other suites.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.LOG_SILENT = 'true';
process.env.AUTH_RATE_LIMIT_MAX = '2';
process.env.LOGIN_RATE_LIMIT_MAX = '2';
// Four auth requests are made by the tests below and they also consume the
// global budget, so the ceiling is set to 6: requests 5 and 6 (the first two
// health checks) pass and request 7 is rate limited.
process.env.GLOBAL_RATE_LIMIT_MAX = '6';
process.env.SEED_DATA = 'true';

const { createApp } = require('../src/app');
const { seedDatabase } = require('../src/data/seed');

const CREDENTIALS = { email: 'admin@school.test', password: 'Admin@12345' };

let baseUrl;
let server;

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null, headers: response.headers };
}

test.before(async () => {
  await seedDatabase();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  if (server) server.close();
});

test('auth endpoints are rate limited and return the standard error envelope', async () => {
  const first = await api('POST', '/api/auth/login', CREDENTIALS);
  assert.equal(first.status, 200, 'first login is allowed');

  const second = await api('POST', '/api/auth/login', CREDENTIALS);
  assert.equal(second.status, 200, 'second login is allowed');

  const blocked = await api('POST', '/api/auth/login', CREDENTIALS);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.success, false);
  assert.equal(blocked.json.code, 'AUTH_RATE_LIMITED');
  assert.match(blocked.json.message, /Too many authentication requests/);
});

test('rate limited responses advertise the budget through RateLimit headers', async () => {
  const res = await api('POST', '/api/auth/register', {
    name: 'Blocked',
    email: 'blocked@school.test',
    password: 'StrongPass1',
  });

  assert.equal(res.status, 429);
  assert.ok(res.headers.get('ratelimit'), 'draft-7 RateLimit header is exposed');
  assert.ok(res.headers.get('ratelimit-policy'), 'RateLimit-Policy header is exposed');
});

test('the global limiter caps every api route, not just the auth ones', async () => {
  const statuses = [];
  for (let i = 0; i < 4; i += 1) {
    const res = await api('GET', '/api/health');
    statuses.push(res.status);
  }

  assert.deepEqual(statuses, [200, 200, 429, 429]);

  const blocked = await api('GET', '/api/health');
  assert.equal(blocked.json.code, 'GLOBAL_RATE_LIMITED');
});
