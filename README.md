# School Management System — REST API

A backend-only REST API for managing students, teachers, classes, subjects and
student results, built with **Node.js**, **Express 5**, **JWT** and **bcrypt**.

There is no frontend and no real database: all data lives in in-memory arrays
(see [`src/data/db.js`](src/data/db.js)) that are re-seeded on every boot. The
data is fully relational through foreign keys, so deleting a student also
removes their results, deleting a subject removes the marks filed against it,
and so on.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Demo credentials](#demo-credentials)
3. [Project structure](#project-structure)
4. [Response format](#response-format)
5. [Authentication](#authentication)
6. [Authorization matrix](#authorization-matrix)
7. [Endpoints](#endpoints)
8. [Validation rules](#validation-rules)
9. [Security measures](#security-measures)
10. [Logging](#logging)
11. [Rate limiting](#rate-limiting)
12. [Testing](#testing)
13. [Postman / Thunder Client collection](#postman--thunder-client-collection)
14. [Environment variables](#environment-variables)
15. [Design decisions](#design-decisions)

---

## Quick start

Requirements: **Node.js 18+** (developed and tested on Node 24).

```bash
# 1. install dependencies
npm install

# 2. create your environment file
cp .env.example .env

# 3. put your own secrets in .env  (at minimum JWT_SECRET and ADMIN_PASSWORD)
#    generate a JWT secret with:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. start the API
npm start          # or: npm run dev   (restarts on file changes)
```

The API is then available at `http://localhost:4000/api`.

```bash
curl http://localhost:4000/api/health
```

```json
{
  "success": true,
  "message": "School Management API is running",
  "data": {
    "status": "ok",
    "environment": "development",
    "uptimeSeconds": 3,
    "timestamp": "2026-01-05T10:12:00.000Z",
    "database": "in-memory",
    "records": { "users": 3, "students": 6, "teachers": 4, "classes": 4, "subjects": 8, "results": 30 }
  }
}
```

Other scripts:

| Script | Description |
| --- | --- |
| `npm start` | Start the server (seeds the in-memory database first) |
| `npm run dev` | Same, with `--watch` auto-restart |
| `npm test` | Run the integration test suite (56 tests) |
| `npm run seed` | Seed the in-memory store and print a relationship report, then exit |

---

## Demo credentials

The seeder creates three accounts so the API can be explored immediately. The
admin credentials come from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`); the
teacher and student demo accounts are fixed.

| Role | Email | Password |
| --- | --- | --- |
| admin | `admin@school.test` (`ADMIN_EMAIL`) | `Admin@12345` (`ADMIN_PASSWORD`) |
| teacher | `teacher@school.test` | `Teacher@12345` |
| student | `student@school.test` | `Student@12345` |

Each demo account is linked to a real profile record, so
`GET /api/students/me` and `GET /api/teachers/me` return data immediately.

> These are development-only credentials. Change them before deploying anything.

---

## Project structure

```
src/
├── config/
│   └── index.js            # reads + validates .env once, fails fast
├── constants/
│   ├── http-status.js      # status code constants
│   └── roles.js            # admin / teacher / student, terms, statuses
├── controllers/            # HTTP layer: read req, call a service, send res
│   ├── auth.controller.js
│   ├── student.controller.js
│   ├── teacher.controller.js
│   ├── class.controller.js
│   ├── subject.controller.js
│   ├── result.controller.js
│   └── user.controller.js
├── data/
│   ├── db.js               # the in-memory "database" + generic CRUD helpers
│   ├── seed.js             # related demo dataset
│   └── seed-cli.js         # npm run seed
├── middleware/
│   ├── authenticate.js     # JWT verification -> req.user (401)
│   ├── authorize.js        # role checks -> 403
│   ├── validate.js         # express-validator runner -> 400
│   ├── rate-limit.js       # global / auth / login limiters
│   ├── request-logger.js   # method, url, status, duration, timestamp
│   └── error-handler.js    # global error handler + 404 handler
├── routes/                 # URL -> middleware -> controller (permission matrix)
│   ├── index.js
│   ├── auth.routes.js
│   ├── user.routes.js
│   ├── student.routes.js
│   ├── teacher.routes.js
│   ├── class.routes.js
│   ├── subject.routes.js
│   ├── result.routes.js
│   └── health.routes.js
├── services/               # business rules, referential integrity, projections
│   ├── auth.service.js
│   ├── user.service.js
│   ├── student.service.js
│   ├── teacher.service.js
│   ├── class.service.js
│   ├── subject.service.js
│   └── result.service.js
├── utils/
│   ├── api-error.js        # operational error carrying an HTTP status
│   ├── async-handler.js
│   ├── grade.js            # score -> letter grade
│   ├── ids.js
│   ├── jwt.js
│   ├── logger.js
│   ├── password.js         # bcrypt hash / verify
│   ├── query-params.js     # filter, sort, paginate
│   ├── request-data.js     # validated query/body access (Express 5 safe)
│   └── response.js         # the response envelope
├── validators/             # one rule set per resource
│   ├── common.js
│   ├── auth.validator.js
│   ├── user.validator.js
│   ├── student.validator.js
│   ├── teacher.validator.js
│   ├── class.validator.js
│   ├── subject.validator.js
│   └── result.validator.js
├── app.js                  # express app factory (no listen)
└── server.js               # bootstrap: seed -> listen -> graceful shutdown
```

Request flow:

```
request
  -> helmet / cors
  -> request logger
  -> body parser
  -> global rate limiter
  -> route-level: rate limiter -> authenticate -> authorize -> validate
  -> controller -> service -> in-memory store
  -> response envelope
  -> 404 handler -> global error handler
```

---

## Response format

Every response uses the same envelope.

**Success**

```json
{
  "success": true,
  "message": "Student retrieved successfully",
  "data": { "id": "...", "name": "Amina Yusuf", "email": "student@school.test" },
  "meta": { "total": 6, "page": 1, "limit": 20, "totalPages": 1, "count": 6 }
}
```

`meta` is only present on list endpoints.

**Error**

```json
{
  "success": false,
  "message": "Student not found",
  "code": "STUDENT_NOT_FOUND",
  "errors": [{ "field": "email", "message": "email is already in use" }],
  "requestId": "0f0a1b2c-..."
}
```

`errors` appears on validation failures (400). `requestId` echoes the
`X-Request-Id` response header so a log line can be found for any response.

### Status codes

| Code | Used for |
| --- | --- |
| 200 | Successful read / update |
| 201 | Resource created |
| 400 | Validation failure, malformed JSON, bad referential reference |
| 401 | Missing, malformed, expired or unverifiable token; bad credentials |
| 403 | Authenticated but the role or ownership does not allow the action |
| 404 | Unknown route, or a valid id that does not exist |
| 409 | Uniqueness conflict (duplicate email, class name, subject code, result) |
| 413 | Request body larger than the configured limit |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error (details are logged, never returned) |

---

## Authentication

`POST /api/auth/register` and `POST /api/auth/login` are public; every other
route requires a token.

```bash
# 1. log in
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@school.test","password":"Admin@12345"}'
```

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "id": "…", "name": "System Administrator", "email": "admin@school.test", "role": "admin" },
    "token": "eyJhbGciOiJIUzI1NiIs…",
    "tokenType": "Bearer",
    "expiresIn": "1h"
  }
}
```

```bash
# 2. send it as a bearer token
curl http://localhost:4000/api/students -H "Authorization: Bearer $TOKEN"
```

**What the middleware does** ([`src/middleware/authenticate.js`](src/middleware/authenticate.js)):

1. reads the `Authorization: Bearer <token>` header (401 if absent),
2. verifies signature, algorithm, expiry, issuer and audience (401 if invalid),
3. loads the current user from the store (401 if the account no longer exists),
4. rejects inactive accounts with 403,
5. attaches the sanitised user to `req.user` (never the password hash).

`GET /api/auth/me` returns the caller's identity and, for students and teachers,
their linked profile.

---

## Authorization matrix

Roles: **admin**, **teacher**, **student**.

| Endpoint | admin | teacher | student |
| --- | :---: | :---: | :---: |
| `POST /api/auth/register` | public | public | public |
| `POST /api/auth/login` | public | public | public |
| `GET /api/auth/me` | ✅ | ✅ | ✅ |
| `POST /api/auth/change-password` | ✅ | ✅ | ✅ |
| `GET /api/users` (all roles) | ✅ | ❌ 403 | ❌ 403 |
| `POST/PUT/DELETE /api/users` | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/students` (list) | ✅ | ✅ | ❌ 403 |
| `POST /api/students` | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/students/:id` | ✅ | ✅ | ✅ own only |
| `PUT /api/students/:id` | ✅ | ❌ 403 | ❌ 403 |
| `DELETE /api/students/:id` | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/students/me`, `/me/class`, `/me/results` | ❌ 403 | ❌ 403 | ✅ |
| `GET /api/teachers` (all) | ✅ | ❌ 403 | ❌ 403 |
| `POST/PUT/DELETE /api/teachers` | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/teachers/me` | ❌ 403 | ✅ | ❌ 403 |
| `GET /api/classes` (list) | ✅ | ✅ | ❌ 403 |
| `POST/PUT/DELETE /api/classes` | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/classes/:id` | ✅ | ✅ | ✅ own class only |
| `GET /api/classes/me` | ❌ 403 | ❌ 403 | ✅ |
| `GET /api/subjects` | ✅ | ✅ | ✅ |
| `POST/PUT/DELETE /api/subjects` | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/results` (list) | ✅ all | ✅ all | ✅ own only |
| `POST /api/results` | ✅ | ✅ | ❌ 403 |
| `PUT /api/results/:id` | ✅ | ✅ | ❌ 403 |
| `DELETE /api/results/:id` | ✅ | ❌ 403 | ❌ 403 |
| `GET /api/results/:id` | ✅ | ✅ | ✅ own only |

Two rules that are easy to miss:

* **Teachers cannot manage administrators.** Account administration lives
  entirely behind `adminOnly` on `/api/users`; a teacher receives 403 there.
* **Students cannot widen their own scope.** `GET /api/results` forces the
  `studentId` filter server-side, so passing `?studentId=<someone else>` has no
  effect, and reading a specific foreign record returns 403 rather than data.

---

## Endpoints

Base URL: `http://localhost:4000/api`

### Health

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness probe + record counts |

### Authentication

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | Create a student or teacher account |
| POST | `/auth/login` | public | Exchange credentials for a JWT |
| GET | `/auth/me` | any role | Current identity (+ linked profile) |
| POST | `/auth/change-password` | any role | Change own password |
| POST | `/auth/logout` | any role | Stateless: the client discards the token |

`register` accepts `name`, `email`, `password`, optional `confirmPassword`,
optional `phone` and an optional `role` of **student** or **teacher**. Requesting
`admin` returns 400 — admin accounts can only be created by an existing admin
through `POST /api/users`. Registering also creates the matching profile record
and links the two by id.

### Users (admin only)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/users` | List accounts (filter by `role`, `status`, `search`) |
| POST | `/users` | Create an account with **any** role |
| GET | `/users/:id` | Fetch one account |
| PUT | `/users/:id` | Update name, email, role, status or password |
| DELETE | `/users/:id` | Delete an account |

An admin cannot delete, deactivate or demote their own account (400).

### Students

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/students` | admin | Create |
| GET | `/students` | admin, teacher | List (paginated) |
| GET | `/students/:id` | admin, teacher, owner | Fetch one |
| PUT | `/students/:id` | admin | Update |
| DELETE | `/students/:id` | admin | Delete (also removes their results) |
| GET | `/students/me` | student | Own profile |
| GET | `/students/me/class` | student | Own class |
| GET | `/students/me/results` | student | Own results |

```json
{
  "id": "6a0f…",
  "name": "Amina Yusuf",
  "email": "student@school.test",
  "phone": "+2348020000001",
  "classId": "9b21…",
  "class": { "id": "9b21…", "name": "JSS 1 - Alpha", "gradeLevel": 7 },
  "gender": "unspecified",
  "status": "active",
  "hasAccount": true,
  "createdAt": "2026-01-05T10:00:00.000Z",
  "updatedAt": "2026-01-05T10:00:00.000Z"
}
```

### Teachers

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/teachers` | admin | Create |
| GET | `/teachers` | admin | List (paginated) |
| GET | `/teachers/:id` | admin | Fetch one |
| PUT | `/teachers/:id` | admin | Update |
| DELETE | `/teachers/:id` | admin | Delete (releases their classes) |
| GET | `/teachers/me` | teacher | Own profile |

### Classes

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/classes` | admin | Create |
| GET | `/classes` | admin, teacher | List (filter by `gradeLevel`, `teacherId`) |
| GET | `/classes/:id` | admin, teacher, member | Fetch one |
| PUT | `/classes/:id` | admin | Update |
| DELETE | `/classes/:id` | admin | Delete (releases its students) |
| GET | `/classes/me` | student | Own class |

### Subjects

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/subjects` | admin | Create |
| GET | `/subjects` | all roles | List (filter by `isActive`) |
| GET | `/subjects/:id` | all roles | Fetch one |
| PUT | `/subjects/:id` | admin | Update |
| DELETE | `/subjects/:id` | admin | Delete (also removes its results) |

### Results

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/results` | admin, teacher | Record a mark |
| GET | `/results` | admin, teacher, student (own) | List (filterable) |
| GET | `/results/:id` | admin, teacher, student (own) | Fetch one |
| PUT | `/results/:id` | admin, teacher | Update (grade is recalculated) |
| DELETE | `/results/:id` | admin | Delete |

Result filters: `studentId`, `subjectId`, `classId`, `term`, `session`, `grade`,
`minScore`, `maxScore`, plus pagination and sorting.

```json
{
  "id": "c41d…",
  "studentId": "6a0f…",
  "student": { "id": "6a0f…", "name": "Amina Yusuf", "email": "student@school.test" },
  "subjectId": "1f7c…",
  "subject": { "id": "1f7c…", "name": "Mathematics", "code": "MTH101", "credits": 3 },
  "classId": "9b21…",
  "class": { "id": "9b21…", "name": "JSS 1 - Alpha" },
  "score": 78,
  "grade": "A",
  "gradePoint": 5,
  "remark": "Distinction",
  "term": "second",
  "session": "2025/2026",
  "recordedBy": { "id": "…", "name": "Ada Obi", "role": "teacher" },
  "createdAt": "2026-01-05T10:05:00.000Z"
}
```

### List query parameters

All `GET` collection endpoints accept:

| Parameter | Notes |
| --- | --- |
| `page` | 1-based, default 1 |
| `limit` | 1–100, default 20 |
| `search` | Case-insensitive match on the resource's text fields |
| `sortBy` | Whitelisted per resource (`name`, `email`, `createdAt`, `score`, …) |
| `order` | `asc` or `desc` |

---

## Validation rules

Implemented with `express-validator`; every failure returns 400 and lists **all**
problems at once.

| Field | Rule |
| --- | --- |
| `id` (path) | Must be a UUID v4 — otherwise 400. A well-formed but unknown id is 404 |
| `name` | Required on create, 2–80 characters, not blank |
| `email` | Valid email, ≤ 120 characters, lower-cased, unique per collection |
| `password` | 8–72 characters with at least one uppercase letter, one lowercase letter and one digit. (72 is bcrypt's limit — longer input would be silently truncated) |
| `role` | `admin` \| `teacher` \| `student`; self-registration accepts only `student`/`teacher` |
| `phone` | Optional. `+`, digits, spaces, dashes, parentheses (6–20 chars) |
| `classId` / `teacherId` / `studentId` / `subjectId` | Optional/required UUID, and the record must exist |
| `gradeLevel` | Integer 1–12 |
| `capacity` | Integer 1–1000 |
| `subject.code` | 2–4 letters + 3–4 digits (`MTH101`), unique |
| `subject.credits` | Integer 1–12, default 3 |
| `score` | Number 0–100 |
| `grade` | Derived server-side from the score. If supplied it must match (`score 30` + `grade A` → 400) |
| `term` | `first` \| `second` \| `third` |
| `session` | `YYYY/YYYY` (e.g. `2025/2026`) |
| Unknown body keys | Rejected — only documented fields are accepted |
| Body shape | `PUT` requires at least one field; JSON primitives are rejected |

Unknown fields are refused on purpose: it turns a typo (`emial`) or an attempt
to smuggle a privileged field (`role`, `id`, `passwordHash`) into a clear 400
instead of silently ignoring it.

---

## Security measures

| Measure | Where |
| --- | --- |
| Passwords hashed with bcrypt (cost 10, configurable) | `utils/password.js` |
| Plain-text passwords never stored or logged; never returned in a response (users are passed through a sanitising projection) | `services/user.service.js` → `toPublicUser()` |
| JWT secret only in `.env`, git-ignored; startup fails if it is missing or still a placeholder | `config/index.js` |
| Tokens verified for signature, algorithm, expiry, issuer and audience | `utils/jwt.js` |
| Passwords capped at 72 bytes to avoid silent bcrypt truncation | `validators/auth.validator.js` |
| Identical 401 for unknown email and wrong password (no account enumeration), with a dummy hash compare to flatten timing | `services/auth.service.js` |
| Public self-registration cannot mint an administrator (validated *and* enforced in the service) | `services/auth.service.js` |
| Role checks on every route; ownership checks on the records a student may read | `middleware/authorize.js`, controllers |
| Admin lock-out prevented (cannot delete/demote/deactivate self) | `controllers/user.controller.js` |
| Strict input validation + unknown-field rejection + referential integrity | `validators/`, `services/` |
| Helmet security headers, `x-powered-by` disabled | `app.js` |
| CORS restricted by `CORS_ORIGIN` | `app.js` |
| JSON body size limit (20 kB default) | `app.js` |
| Rate limiting on auth endpoints and globally | `middleware/rate-limit.js` |
| Unexpected errors logged server-side, reported as an opaque 500 | `middleware/error-handler.js` |
| `X-Request-Id` on every request/response for traceability | `middleware/request-logger.js` |

---

## Logging

Every request is logged with the HTTP method, URL, status code, duration and an
ISO-8601 timestamp; authenticated requests also show the user id and role.

```
2026-01-05T10:12:03.114Z INFO  c1c1d27d GET    /api/health 200 25.6ms
2026-01-05T10:12:04.882Z INFO  ef333796 POST   /api/auth/login 401 128.1ms
2026-01-05T10:12:05.201Z INFO  596495ce GET    /api/students 403 2.9ms user=7fbb1175(student)
```

Set `LOG_FORMAT` to change the layout of the request log line:

| Value | Format |
| --- | --- |
| `dev` (default) | Compact, colourised: `requestId METHOD url status duration user=id(role)` |
| `combined` | morgan-style: IP, method, URL, status, bytes, response time, user agent |
| `tiny` | Minimal: `<status> <method> <url> - <ms>ms` |

`LOG_LEVEL` sets the verbosity (`error`, `warn`, `info`, `debug`; default
`info`). `LOG_SILENT=true` disables output (used by the test suite) and
`NO_COLOR=1` disables colours when piping to a file.

---

## Rate limiting

| Limiter | Applies to | Default | Env |
| --- | --- | --- | --- |
| Global | every `/api` route | 300 / 15 min | `GLOBAL_RATE_LIMIT_MAX`, `GLOBAL_RATE_LIMIT_WINDOW_MS` |
| Auth | `POST /api/auth/register`, `/api/auth/login`, `change-password` | 20 / 15 min | `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` |
| Login | `POST /api/auth/login` (failures only) | 10 / 15 min | `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS` |

A throttled response is 429 and uses the standard envelope:

```json
{ "success": false, "message": "Too many authentication requests from this IP. Please try again later.", "code": "AUTH_RATE_LIMITED" }
```

Responses carry the standard `RateLimit` and `RateLimit-Policy` headers
(RFC draft 7). Successful logins are not counted against the login limiter, so
a legitimate user is never locked out while credential stuffing is still
throttled.

> Rate-limit state is per process, which is correct for a single in-memory
> instance. A multi-instance deployment would inject a shared store in
> `middleware/rate-limit.js`.

---

## Testing

```bash
npm test
```

```
ℹ tests 56
ℹ pass 56
ℹ fail 0
```

The suite starts the real Express app on an ephemeral port and drives it over
HTTP, so middleware order, validation, authorization and error handling are all
exercised as a client sees them. It covers:

* registration, duplicate emails, weak passwords, unknown fields, role escalation attempts,
* login, wrong password vs unknown email, token expiry/format/signature failures,
* 401 for missing, malformed, tampered and orphaned tokens; 403 for inactive accounts,
* role matrix checks for all three roles (including "teacher cannot manage admins"),
* student/teacher/class/subject CRUD with uniqueness, referential and cascade behaviour,
* result creation, server-derived grades, duplicate detection, score/term/session validation,
* ownership enforcement (student reading another student's record or result → 403),
* error handling: 404 unknown route, 400 malformed JSON, 400 unknown reference,
* security: no password or bcrypt hash in any response, hardening headers, `X-Request-Id`.

---

## Postman / Thunder Client collection

[`postman/School-Management-API.postman_collection.json`](postman/School-Management-API.postman_collection.json)
— 97 requests across 11 folders, each with a test script that asserts the
expected status code.

1. Start the API: `npm start`
2. Import the collection into Postman (or Thunder Client)
3. Run it **top to bottom** with the Collection Runner (sequential order):
   tokens and record ids are captured by the test scripts into collection
   variables, so later requests depend on earlier ones
4. `baseUrl` defaults to `http://localhost:4000/api` — change the variable if
   your port differs

| Folder | Demonstrates |
| --- | --- |
| 00 Health | Liveness probe |
| 01 Authentication | Registration, login, wrong credentials, `/me`, change password, logout |
| 02 Setup | Captures the record ids used by the negative tests |
| 03 Authorization | 401 without a valid token, 403 for wrong role, 403 for wrong owner |
| 04 Students | Full admin CRUD, search, validation, conflicts, self-service routes |
| 05 Teachers | Full admin CRUD, own profile, 403 for students |
| 06 Classes | Full admin CRUD, unique name, teacher read access, own class |
| 07 Subjects | Full admin CRUD, read access for every role |
| 08 Results | Teacher create/update, derived grades, duplicates, validation, student scope |
| 09 Users | Admin-only account management and self-protection |
| 10 Error handling | Unknown route, malformed JSON, empty body, security headers |

---

## Environment variables

All configuration is read and validated once at boot by
[`src/config/index.js`](src/config/index.js). Invalid values abort startup with a
readable message instead of failing at request time.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Environment name |
| `PORT` | `4000` | HTTP port |
| `API_PREFIX` | `/api` | Mount point for all routes |
| `CORS_ORIGIN` | `*` | Comma-separated origins, or `*` |
| `LOG_FORMAT` | `dev` | Request log layout: `dev` \| `combined` \| `tiny` |
| `LOG_LEVEL` | `info` | Verbosity: `error` \| `warn` \| `info` \| `debug` |
| `LOG_SILENT` | `false` | Disable log output |
| `TRUST_PROXY_HOPS` | `0` | Reverse proxies in front of the app (correct client IPs) |
| `JSON_BODY_LIMIT` | `20kb` | Maximum request body size |
| `JWT_SECRET` | — | **Required.** Signing secret; must not be a placeholder |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime |
| `JWT_ISSUER` | `school-management-system` | `iss` claim, verified on every request |
| `JWT_AUDIENCE` | `school-management-api` | `aud` claim, verified on every request |
| `BCRYPT_SALT_ROUNDS` | `10` | bcrypt cost factor |
| `PASSWORD_MIN_LENGTH` | `8` | Minimum password length |
| `PASSWORD_MAX_LENGTH` | `72` | Maximum (bcrypt's limit) |
| `AUTH_RATE_LIMIT_MAX` / `_WINDOW_MS` | `20` / `900000` | Auth limiter |
| `LOGIN_RATE_LIMIT_MAX` / `_WINDOW_MS` | `10` / `900000` | Login limiter (failures) |
| `GLOBAL_RATE_LIMIT_MAX` / `_WINDOW_MS` | `300` / `900000` | Global limiter |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Bootstrap administrator (from `.env`, not hard-coded) |
| `SEED_DATA` | `true` | Set to `false` to start empty |
| `SEED_STUDENTS` / `_TEACHERS` / `_CLASSES` / `_SUBJECTS` / `_RESULTS` | `6` / `4` / `4` / `8` / `30` | Seed volume |

`.env` is git-ignored; `.env.example` is committed and contains no real secret.

---

## Design decisions

**bcryptjs instead of the native `bcrypt` module.** `bcrypt` needs a native
build toolchain, which breaks `npm install` on some machines. `bcryptjs` is the
same algorithm with the same hashes and cost factor, in pure JavaScript — a drop-in
choice that keeps setup to a single command. (Switching back is a one-line
change in `utils/password.js`.)

**Self-registration cannot create admins.** The assessment requires an admin
role, but letting anyone POST `{"role":"admin"}` would be a critical
vulnerability. Registration accepts `student` and `teacher` only; the first
administrator is bootstrapped from `.env`, and further admins are created
through the admin-only `POST /api/users`. The rule is enforced in the validator
*and* in the service layer.

**Students cannot list students.** Students read their own data through
`/api/students/me*` and `/api/results` (scoped server-side). The school-wide
list returns 403, and reading a specific foreign record returns 403 too — the
`/api/students/:id` route is open to all roles and the *controller* checks
ownership, which keeps one route instead of duplicating it per role.

**The grade is always derived from the score.** Clients may send `grade`, but it
must agree with the score, and any update recalculates it. Otherwise a result of
`score 30 / grade A` could be stored.

**Foreign keys are validated and cascades are explicit.** Creating a result
requires an existing student and subject (400 otherwise) and takes the class
from the student, so a mark can never be filed against the wrong class.
Deleting a student removes their results, deleting a subject removes its
results, deleting a class releases its students — and each response reports how
many related records were affected.

**Students only see their own records; staff see everything with pagination.**
Every list endpoint accepts `page`, `limit`, `search`, `sortBy` and `order` with a
whitelisted `sortBy`, and returns a `meta` block.

**`req.query` is read through `matchedData`.** Express 5 exposes `req.query`
through a getter that re-parses the query string on every access, so
express-validator's `toInt()` / `toBoolean()` sanitisers would be discarded.
[`utils/request-data.js`](src/utils/request-data.js) reads the sanitised values
from the validation contexts instead.

**In-memory data is a singleton store, not module-level arrays scattered around.**
`data/db.js` owns the collections and generic helpers, and exposes `stats()` for
the health endpoint. Because the store is in memory, every restart resets it —
that is the intended trade-off for this exercise, and `SEED_DATA=false` starts
from empty.
