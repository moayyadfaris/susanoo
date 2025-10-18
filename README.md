<p align="center">
  <img src="public/assets/Battle_Susanoo_Main.png" width="200" alt="Susanoo logo"/>
</p>

<h1 align="center">Susanoo API Platform</h1>

[![Build Status](https://travis-ci.com/moayyadfaris/susanoo.svg?token=RPUCvPPCNd1UVpCM1Tyq&branch=master)](https://travis-ci.com/moayyadfaris/susanoo)

Susanoo is a modular Node.js/Express platform for building enterprise-grade APIs. It follows a **service-first architecture**, uses **Objection.js/Knex.js** for relational data access, and ships with production-ready middleware, authentication flows, and queue-based notifications.

- **Primary language:** Node.js (ES6+)
- **Framework:** Express 4
- **Database:** PostgreSQL + Objection.js ORM
- **Queues:** Bull (Redis-backed)
- **Auth:** JWT (access + refresh tokens), role-based access control
- **Validation:** Joi (via `backend-core` request rules)
- **Docs:** Swagger/OpenAPI (auto-generated)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Layout](#project-layout)
3. [Environment Setup](#environment-setup)
4. [Running the Platform](#running-the-platform)
5. [Core Services](#core-services)
6. [Queues & Notifications](#queues--notifications)
7. [Security & Middleware](#security--middleware)
8. [API Documentation](#api-documentation)
9. [Testing](#testing)
10. [Development Tips](#development-tips)

---

## Architecture Overview

Susanoo is composed of several layers:

| Layer | Responsibility |
|-------|----------------|
| `handlers/` | Request handlers (business endpoints) that orchestrate validation, logging, and service calls. |
| `services/` | Domain services encapsulating business logic (users, auth, stories, countries, interests, etc.). |
| `database/dao/` | Objection.js DAO classes for data persistence operations. |
| `middlewares/` | Reusable Express middlewares (sanitization, auth token checks, init hooks). |
| `clients/` | External integrations (Redis, queues, S3, email, SMS, Slack). |
| `config/` | Environment-aware configuration modules (app, token, redis, queue, roles, etc.). |

The main entry point (`main.js`) performs the following steps:

1. Load environment & configuration.
2. Initialize database connection pools (Knex/Objection).
3. Initialize services via the registry defined in `services/index.js`.
4. Boot the Express server (`core/lib/Server.js`), wiring controllers and middlewares.
5. Start ancillary consumers (optional) and expose health endpoints.

This separation keeps business logic testable and makes it straightforward to add new verticals (controllers + services + DAOs).

---

## Project Layout

```
├── consumers/          # Queue consumers (e.g., notifications-consumer.js)
├── controllers/        # Express controllers (app + web namespaces)
├── handlers/           # Request handlers invoked by controllers
├── services/           # Domain service modules and registry
├── database/
│   ├── dao/            # Objection.js DAO classes
│   └── migrations/     # Knex migrations/seeds
├── middlewares/        # Express middlewares
├── notifications/      # Email/SMS notification templates
├── clients/            # External service clients (Redis, S3, Email, SMS, Queue)
├── config/             # Environment-specific configuration loaders
├── queue/              # Dedicated queue utilities (e.g., dashboard runner)
├── public/             # Static assets & swagger docs
├── core/               # Shared kernel (Server, BaseDAO, Logger, etc.)
└── main.js             # Application bootstrap
```

---

## Environment Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/moayyadfaris/susanoo.git
   cd susanoo
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.example` (if provided) to `.env`.
   - Fill in database credentials, Redis host/port, token secrets, and SMTP/SMS providers.
   - Minimal variables:
     - `APP_PORT`, `APP_HOST`, `APP_NAME`
     - `KNEX_*` (database settings) or use `config/knex.js`
     - `TOKEN_ACCESS_SECRET`, `TOKEN_REFRESH_EXP`, etc.
     - `REDIS_HOST`, `REDIS_PORT` (optional but required for rate limiting & queues)

3. **Database migrations & seeds (PostgreSQL recommended):**
   ```bash
   npm run migrate
   npm run seed   # optional demo data
   ```

---

## Running the Platform

### API Server
- Development (with `nodemon`):
  ```bash
  npm run dev
  ```
- Production-style run:
  ```bash
  npm start
  ```

The server listens on `APP_HOST:APP_PORT` (default `localhost:4000`). Health and metrics endpoints are added automatically via `core/lib/Server.js`.

### Queue Dashboard *(optional)*
- A standalone Bull Board dashboard can be launched via:
  ```bash
  npm run queue:dashboard
  ```
  - Runs on `QUEUE_DASHBOARD_PORT` (default `3030`) at `/queues`.
  - Pulls queue instances from `handlers/RootProvider.js`.

### Notifications Consumer
- Processes queued notifications (email/SMS):
  ```bash
  npm run notifications-dev
  ```
  Ensure Redis is running and the queue producer (API) is configured with `config.queue.redisUrl`.

---

## Core Services

Dependencies are injected during initialization in `initializeServices()` (see `main.js`). Key services include:

| Service | Module | Notes |
|---------|--------|-------|
| Auth | `services/auth` | Handles login, sessions, security analytics, token refreshing. |
| Users | `services/users/UserService.js` | Registration, email verification, profile updates, password changes. |
| Stories & Attachments | `services/stories`, `services/attachments` | Story management, attachment handling, caching. |
| Country & Interests | `services/country`, `services/interests` | Domain reference data and user interest linking. |
| Runtime Settings | `services/runtimeSettings` | Feature toggles / runtime configuration. |

Each service exposes methods wrapped with `executeOperation()` for consistent logging and error handling. Handlers resolve services via helper exports in `services/index.js`.

---

## Queues & Notifications

- Bull queue configured in `queue/index.js` and consumed by `consumers/notifications-consumer.js`.
- Notification jobs (`notificationType.*`) trigger email/SMS templates under `notifications/`.
- Configure SMTP via `.env` (Mailtrap/Ethereal recommended for dev).
- Bull Board dashboard (optional) provides visibility into job status.

---

## Security & Middleware

Key middlewares in `middlewares/`:

| Middleware | Purpose |
|------------|---------|
| `InitMiddleware` | Request metadata, timing instrumentation. |
| `CheckAccessTokenMiddleware` | Auth token verification and RBAC integration. |
| `SanitizeMiddleware` | Input sanitization/XSS protection. |
| `CacheMiddleware` | Response caching when enabled. |

Security features:
- Sanitization and header hardening (Helmet).
- Rate limiting via `express-rate-limit` (Redis-backed).
- JWT-based authentication with role enforcement (see `config/roles.js`).
- User service enforces `isActive` and `isVerified` checks where appropriate (e.g., web login).

---

## API Documentation

- Swagger/OpenAPI definitions generated from controllers + JSDoc comments:
  ```bash
  npm run docs      # app controllers
  npm run docs-web  # web controllers
  ```
- Output: `public/docs/swagger.json` + `public/docs/swagger-web.json`.
- Swagger UI is mounted automatically by the server (see log output for `/api-docs` URL).

---

## Testing

Example login API test (uses supertest):
```bash
npm run test:api:login
```

Notes:
- Tests assume database/Redis availability depending on feature (rate-limiting tests skip without Redis).
- Temporary users (`@susanoo.test`) are created and cleaned up automatically.
- Additional test scripts can be added under `tests/`.

---

## Development Tips

- **Service Registry:** Extend `serviceDependencies` in `main.js` when introducing new services/DAOs. Services access dependencies via the registry in `services/index.js`.
- **Queue Monitoring:** Use the standalone dashboard (`queue/dashboard.js`) or integrate with your own admin tooling.
- **Email in Dev:** Use Ethereal or Mailtrap credentials in `.env` to inspect outgoing mails.
- **Configuration Inspection:** `config/index.js` aggregates sub-configs; call `config.mainInit()` during bootstrap (already done in `main.js`).
- **Logging:** All services/handlers use a shared logger (`util/logger.js`) with structured JSON output; use grep or log aggregators for analysis.

---

## Contributing / Next Steps

- Follow the ES6 style and linting rules (`npm run lint`).
- Add new routes under `controllers/` and keep business logic inside services.
- Update Swagger docs and README when introducing breaking changes.
- Consider adding health dashboards if you keep the new service manager; otherwise use the existing registry’s helpers.

Happy hacking! 🛠️
