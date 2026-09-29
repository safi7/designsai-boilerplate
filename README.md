# Boilerplate AI

A production-shaped monorepo for an AI chat product: accounts, a credit ledger, payments, email, object storage and a streaming AI assistant, split into independently deployable services.

```
┌──────────┐  cookie session  ┌──────────┐  /internal/* + token  ┌──────────┐
│   web    │ ───────────────► │   api    │ ────────────────────► │  agents  │
│ Next.js  │ ◄── SSE stream ─ │   Hono   │ ◄──── NDJSON ──────── │  Mastra  │
└──────────┘                  └────┬─────┘                       └────┬─────┘
                                   │ Prisma   │ pub/sub               │ memory
                               ┌───▼───┐  ┌───▼────┐              ┌───▼──────┐
                               │ MySQL │  │ Valkey │              │ Postgres │
                               └───────┘  └────────┘              └──────────┘
                     + MinIO/S3 (avatars) · SMTP/SES (email) · Stripe (credit packs)
```

## Quick start

Requirements: Docker, Node 22 and Corepack. No API keys are needed: by default the agents service uses an offline mock model.

```bash
make up          # builds and starts everything, then open http://localhost:3000
make e2e         # black-box smoke test against the running stack
```

| URL                       | What                                                  |
| ------------------------- | ----------------------------------------------------- |
| http://localhost:3000     | Web app                                               |
| http://localhost:8000/doc | API docs (Swagger UI, OpenAPI 3.1)                    |
| http://localhost:8025     | Mailpit. Every email (including OTP codes) lands here |
| http://localhost:9001     | MinIO console (`minioadmin` / `minioadmin`)           |

To get real model answers, set `AGENTS_MODEL_PROVIDER=openrouter` and `OPENROUTER_API_KEY=…` in a root `.env`, then run `make up`. If a port clashes with something already running, override it with `WEB_PORT`, `API_PORT`, `MAILPIT_PORT` and similar variables.

Hot-reload development runs the apps on the host and only the infrastructure in Docker:

```bash
make setup       # deps, infra containers, migrations, seed, .env
make dev         # api :8000, agents :8111, web :3000
```

## What's in the box

| Area            | Highlights                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Auth**        | Email and password with bcrypt. Mandatory email verification via 6-digit OTP. Passwordless sign-in by code. Password reset. Optional Google sign-in. JWT carried in an httpOnly `SameSite=Lax` cookie and backed by server-side sessions, so logout, "sign out everywhere" and revoking a session take effect immediately. Rate limits use a Redis sliding window. Login and code requests do not reveal whether an account exists, and login is timing-equalized. |
| **Credits**     | Double-entry-style ledger: sources, transactions and per-source allocations. Credits with the soonest expiry are spent first. Every write locks the user's row and carries an idempotency key backed by a UNIQUE index, so retries never double-charge. Each chat turn is billed from real token usage. New users get a signup bonus. There is a CLI for operator grants.                                                                                          |
| **Payments**    | Stripe Checkout for credit packs. Credits are granted only from the signature-verified webhook, keyed per payment. Checkout is disabled cleanly when Stripe isn't configured.                                                                                                                                                                                                                                                                                      |
| **Ask AI chat** | Answers stream token by token over resumable SSE, backed by a durable, cursor-ordered event log. One turn runs at a time per thread. Users can stop an answer mid-stream. Threads get auto-generated titles. Conversation memory plus working memory scoped to the user. A sweep recovers turns orphaned by a crash. Works across API replicas via Redis pub/sub.                                                                                                  |
| **Storage**     | S3 API: MinIO locally, S3 in the cloud (with IAM role support). Avatar uploads are checked by magic number and served through short-lived presigned URLs.                                                                                                                                                                                                                                                                                                          |
| **Email**       | SMTP (Mailpit locally) or AWS SES. Localized Handlebars templates (en/es) with HTML and text parts.                                                                                                                                                                                                                                                                                                                                                                |
| **Web**         | Next.js 16 App Router with the React Compiler. i18n with next-intl (en/es). Tailwind v4 and shadcn/ui. TanStack Query. Light and dark themes. Accessible forms. Sidebar with search, favorites, rename and delete. Account, sessions and billing pages.                                                                                                                                                                                                            |
| **Ops**         | Multi-stage non-root Docker images with healthchecks. One-shot migrate-and-seed container. Liveness and readiness probes. Structured JSON logs with request IDs. Graceful shutdown. GitHub Actions CI with lint, type-check, tests, build, MySQL integration tests and Docker end-to-end tests.                                                                                                                                                                    |

## Repository layout

```
apps/
  api/        Hono REST API: auth, users, credits, payments, agent facade, SSE
  agents/     Mastra runtime: Ask AI agent, title agent, internal routes (never public)
  web/        Next.js frontend
packages/
  shared-prisma   schema.prisma, migrations, Prisma client
  shared-schemas  Zod contracts shared by web, api and agents (single source of truth)
  shared-utils    AppError + error codes, localized email templates
  shared-cache    Redis/Valkey clients, cache-aside helper, health check
  shared-storage  S3/MinIO object storage service
  shared-audit    append-only audit trail
  shared-logger   Winston logger (pretty in dev, JSON in prod)
scripts/          e2e smoke test
docs/             architecture and decision records
```

## Quality gates

```bash
make check             # lint + type-check + unit tests + build (what CI runs)
make test-integration  # ledger tests against real MySQL (row locks, unique races)
make e2e               # full-stack smoke test (register → verify → chat → billing)
```

## Further reading

- [GUIDE.md](GUIDE.md): plain-English guide to every tool, pattern and design choice, plus a reading path through the code
- [docs/architecture.md](docs/architecture.md): request flows, chat streaming protocol, credit ledger and security model
- [docs/decisions.md](docs/decisions.md): why things are built the way they are
- [.env.example](.env.example): every configuration variable, documented
