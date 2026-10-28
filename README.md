# Amrutam Telemedicine API

Backend REST API for a telemedicine platform, built with **Node.js, TypeScript, Express 5, PostgreSQL, and Redis**. It provides authentication, doctor discovery and availability, appointment booking, consultations, prescriptions, payment simulation, and admin analytics.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Run the API](#run-the-api)
- [API endpoints](#api-endpoints)
- [OpenAPI documentation](#openapi-documentation)
- [Tests](#tests)
- [Health and observability](#health-and-observability)
- [Security notes](#security-notes)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Features

- Patient registration, login, refresh, logout, and current-user endpoint.
- JWT-based authentication and role-based authorization for patients, doctors, and admins.
- Doctor search, doctor profiles, and availability-slot management.
- Appointment booking, listing, cancellation, and idempotency-key support.
- Consultation retrieval and status transitions.
- Prescription creation and retrieval.
- Payment status lookup and simulated payment outcomes.
- Admin doctor creation/verification and analytics.
- PostgreSQL persistence and Redis-backed rate limiting.
- Request IDs, structured logging, HTTP security headers, request validation, and Prometheus metrics.
- Docker Compose configuration for local PostgreSQL and Redis.
- Vitest and Supertest test suite.

## Tech stack

- Node.js (version 20 or newer)
- TypeScript
- Express 5
- PostgreSQL 16
- Redis 7
- Zod validation
- JWT and Argon2
- Pino logging
- `prom-client` metrics
- Vitest and Supertest
- Docker / Docker Compose

## Prerequisites

Install:

- Node.js **20+** and npm
- Docker Engine and Docker Compose plugin (recommended for local database services)
- Git

## Getting started

### 1. Get the source code

```bash
git clone https://github.com/yashunh/Amrutam-Backend.git
cd Amrutam-Backend
```

If you downloaded the repository as a ZIP, extract it and open a terminal in the project directory containing `package.json`.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Update `.env` with the local credentials shown below. The example values in `docker-compose.yml` are development-only; do not use them in production.

```dotenv
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://amrutam_user:amrutam_dev_123@127.0.0.1:5432/amrutam
TEST_DATABASE_URL=postgresql://amrutam_user:amrutam_dev_123@127.0.0.1:5432/amrutam_test

REDIS_URL=redis://127.0.0.1:6379
REDIS_PASSWORD=redis_dev_123

JWT_SECRET=replace_this_with_a_random_secret_at_least_32_characters_long
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_DAYS=7

CORS_ORIGIN=http://localhost:5173
```

`JWT_SECRET` must contain at least 32 characters. `CORS_ORIGIN` accepts a comma-separated list of allowed browser origins. Keep `.env` out of version control and use strong, unique secrets outside local development.

### 4. Start PostgreSQL and Redis

From the project root:

```bash
docker compose up -d
```

Check that the services are running:

```bash
docker compose ps
```

The Compose file exposes PostgreSQL on `127.0.0.1:5432` and Redis on `127.0.0.1:6379`, and persists PostgreSQL data in a Docker volume.

### 5. Initialize the database

Apply the full schema to a **new or disposable local database**:

```bash
npm run db:schema
```

This runs `src/db/schema.sql`. It is intended for initial setup and may create or reset database objects; inspect the SQL before using it on any database containing data.

For applying additive schema changes instead:

```bash
npm run db:apply
```

This runs `src/db/additive.sql`. Review the SQL and repository's current schema before choosing which command to run.

### 6. Start the development server

```bash
npm run dev
```

The API listens on `http://localhost:3000` by default.

Quick checks:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

## Environment variables

| Variable | Required / default | Description |
|---|---|---|
| `NODE_ENV` | Defaults to `development` | Runtime environment: `development`, `test`, or `production` |
| `PORT` | Defaults to `3000` | HTTP port |
| `DATABASE_URL` | Required | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Optional | Separate database connection string for tests, if supported by the test setup |
| `REDIS_URL` | Defaults to `redis://127.0.0.1:6379` | Redis connection string |
| `REDIS_PASSWORD` | Optional | Redis password when authentication is enabled |
| `JWT_SECRET` | Required; minimum 32 characters | Secret used for JWT operations |
| `JWT_ACCESS_EXPIRES` | Defaults to `15m` | Access-token lifetime |
| `JWT_REFRESH_DAYS` | Defaults to `7` | Refresh-token lifetime in days; accepted range is 1–30 |
| `CORS_ORIGIN` | Defaults to `http://localhost:5173` | Comma-separated allowed origins |

The application validates environment configuration at startup and exits if required values are invalid or missing.

## Run the API

Development mode with automatic reload:

```bash
npm run dev
```

Compile TypeScript:

```bash
npm run build
```

Run the compiled application:

```bash
npm start
```

`npm start` expects the build output at `dist/server.js`, so run `npm run build` first.

## API endpoints

All versioned API routes use the `/v1` prefix. Authentication and role permissions apply to protected endpoints.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Service name and version |
| `GET`, `HEAD` | `/health` | Liveness check |
| `GET` | `/health/ready` | Readiness check for PostgreSQL and Redis |
| `GET` | `/metrics` | Prometheus metrics |
| `POST` | `/v1/auth/register` | Register a patient |
| `POST` | `/v1/auth/login` | Log in |
| `POST` | `/v1/auth/refresh` | Refresh authentication tokens |
| `POST` | `/v1/auth/logout` | Log out / invalidate refresh session |
| `GET` | `/v1/auth/me` | Get the authenticated user |
| `GET` | `/v1/doctors` | Search doctors |
| `GET` | `/v1/doctors/:id` | Get a doctor |
| `GET` | `/v1/doctors/:id/availability` | List a doctor's available slots |
| `GET`, `PATCH` | `/v1/doctors/me` | Get or update the current doctor's profile |
| `GET` | `/v1/doctors/me/availability` | List the current doctor's slots |
| `POST` | `/v1/doctors/me/availability` | Create an availability slot |
| `PATCH` | `/v1/doctors/me/availability/:slotId` | Update an availability slot |
| `POST` | `/v1/admin/doctors` | Create a doctor (admin) |
| `POST` | `/v1/admin/doctors/:id/verify` | Verify a doctor (admin) |
| `POST` | `/v1/bookings` | Book an available slot |
| `GET` | `/v1/bookings` | List appointments |
| `POST` | `/v1/bookings/:id/cancel` | Cancel an appointment |
| `GET` | `/v1/appointments` | Alias for listing bookings |
| `POST` | `/v1/appointments` | Alias for creating a booking |
| `GET` | `/v1/consultations/:id` | Get a consultation |
| `PATCH` | `/v1/consultations/:id/status` | Update consultation status (doctor/admin) |
| `POST` | `/v1/consultations/:id/prescriptions` | Create a prescription (doctor/admin) |
| `GET` | `/v1/consultations/:id/prescriptions` | Get a consultation's prescription |
| `GET` | `/v1/prescriptions/:id` | Get a prescription |
| `GET` | `/v1/payments/:id` | Get payment details |
| `POST` | `/v1/payments/:id/simulate` | Simulate a payment outcome |
| `GET` | `/v1/admin/analytics` | Admin consultation and payment analytics |

For exact request schemas, response shapes, parameters, and security definitions, use [`docs/openapi.yaml`](docs/openapi.yaml). This table is a quick route overview; the OpenAPI file is the more detailed contract.

### Authentication

Protected endpoints use the authentication mechanism implemented by the API. Depending on the endpoint and client flow, authentication tokens may be returned in responses or handled with cookies. The API enables credentialed CORS, so configure `CORS_ORIGIN` with the exact frontend origin(s); do not use `*` for credentialed browser requests.

### Booking idempotency

The booking creation endpoint accepts an optional `Idempotency-Key` request header. Clients should reuse the same key when retrying the same booking request to help prevent duplicate processing.

## OpenAPI documentation

The OpenAPI 3.1 specification is at:

```text
docs/openapi.yaml
```

You can open it in an editor or load it into Swagger Editor / another OpenAPI viewer. The contract notes that some response objects are generic placeholders and may need further tightening as service response contracts are finalized.

## Tests

Run the test suite:

```bash
npm test
```

The test command runs Vitest in single-run mode. Tests use the files in `tests/` and the configuration in `vitest.config.ts`.

If tests require external services, make sure PostgreSQL and Redis are running and that the test environment points to a dedicated test database. Do not point tests at a production database. To run a single test file:

```bash
npx vitest run tests/health.test.ts
```

## Health and observability

- `GET /health` is a liveness endpoint.
- `GET /health/ready` checks PostgreSQL and Redis readiness.
- `GET /metrics` exposes Prometheus-format metrics.
- Pino and `pino-http` provide structured application/request logging.
- Request IDs are attached to requests to help correlate logs.
- `helmet` configures HTTP security headers.
- The app limits JSON request bodies to 100 KB and uses Redis-backed rate limiting on selected endpoints.

For production deployments, configure your hosting platform to scrape `/metrics` only from trusted infrastructure and avoid exposing operational metrics publicly without an access-control or network policy.

## Security notes

- Never commit `.env` or production credentials.
- Use a strong, unique `JWT_SECRET` of at least 32 characters.
- Configure `CORS_ORIGIN` to the exact trusted frontend origins.
- Use HTTPS in production.
- Keep Node.js and dependencies updated.
- Restrict database and Redis access to the application network.
- Protect `/metrics` at the infrastructure layer if it is exposed publicly.
- Review authentication, role authorization, rate limits, token/cookie settings, and database permissions before deployment.
- Payment endpoints currently include a simulation route; do not treat this as a real payment-provider integration.

## Project structure

```text
.
├── docs/
│   ├── Amrutam_Backend_Architecture.docx
│   ├── Amrutam_Observability_and_Security_Documentation.docx
│   └── openapi.yaml
├── src/
│   ├── config/          # Environment configuration and validation
│   ├── db/              # PostgreSQL, Redis, SQL schema and helpers
│   ├── middleware/      # Authentication, authorization, validation, errors, rate limits
│   ├── modules/
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── bookings/
│   │   ├── consultations/
│   │   ├── doctors/
│   │   ├── payments/
│   │   └── prescriptions/
│   ├── observability/   # Logging and metrics
│   ├── utils/           # Shared helpers
│   ├── app.ts            # Express application and route registration
│   └── server.ts         # Server startup and graceful shutdown
├── tests/                # Vitest / Supertest tests
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Troubleshooting

### Environment validation fails

Check that `.env` exists and contains `DATABASE_URL` and a `JWT_SECRET` of at least 32 characters. Confirm the variable names match `.env.example`.

### PostgreSQL connection fails

```bash
docker compose ps
docker compose logs postgres
```

Confirm `DATABASE_URL` uses the same database name, username, password, and port configured in `docker-compose.yml`.

### Redis connection fails

```bash
docker compose logs redis
```

Make sure `REDIS_URL` points to the local Redis service and `REDIS_PASSWORD` matches the Compose configuration (`redis_dev_123` for the provided local setup).

### Port 3000 is already in use

Set a different `PORT` value in `.env`, then restart the server.

### Stop local services

```bash
docker compose down
```

To also delete the local PostgreSQL data volume (destructive):

```bash
docker compose down -v
```

## License

The `package.json` currently declares the `ISC` license. Confirm the intended licensing terms before publishing or redistributing the project.
