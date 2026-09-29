# The Complete Guide to This Repository

This guide explains everything in this project in plain English: what each tool is, why we picked it, what we could have used instead, how the pieces talk to each other, which design patterns we follow, and how to explore the code yourself from start to finish.

You do not need to read it in one sitting. Each part stands on its own.

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [The big picture (system design)](#2-the-big-picture-system-design)
3. [Folder map: what lives where](#3-folder-map-what-lives-where)
4. [Developer tooling](#4-developer-tooling) (Node, Corepack, Yarn, Turborepo, TypeScript, ESLint, Prettier, Vitest, Make, Docker, Compose, GitHub Actions)
5. [Infrastructure services](#5-infrastructure-services) (MySQL, Prisma, Postgres, Valkey, MinIO, Mailpit, SES, Stripe, OpenRouter, Google)
6. [The three apps](#6-the-three-apps) (api, agents, web)
7. [The shared packages](#7-the-shared-packages)
8. [Libraries and why we chose them](#8-libraries-and-why-we-chose-them)
9. [Design patterns we follow](#9-design-patterns-we-follow)
10. [Key flows, step by step](#10-key-flows-step-by-step)
11. [Security model](#11-security-model)
12. [Configuration and environment variables](#12-configuration-and-environment-variables)
13. [Testing strategy](#13-testing-strategy)
14. [Command cheat sheet](#14-command-cheat-sheet)
15. [Guided tour: explore it by hand, start to finish](#15-guided-tour-explore-it-by-hand-start-to-finish)
16. [Review notes: what was fixed and what is still open](#16-review-notes-what-was-fixed-and-what-is-still-open)
17. [Glossary](#17-glossary)

---

## 1. What this project is

It is a production-shaped starter for an **AI chat product**. A user can:

- sign up with email and password, verify their email with a 6-digit code, sign in with a code instead of a password, reset a password, or sign in with Google;
- chat with an AI assistant whose answers stream in word by word;
- see a sidebar of past conversations (search, favorite, rename, delete);
- pay for "credits" with Stripe, and spend credits on each chat message;
- upload an avatar, change their profile, see and revoke their active sessions;
- use the app in English or Spanish, light or dark mode.

"Production-shaped" means it has the boring parts real products need: rate limits, audit logs, idempotent payments, health checks, structured logs, graceful shutdown, Docker images, CI, and tests.

It runs fully offline by default. The AI service ships with a **mock model** that streams a fake answer, so nobody needs an API key to try it.

---

## 2. The big picture (system design)

### 2.1 The services

```
                        Browser
                           │
                           ▼
┌──────────────┐   cookie session    ┌──────────────┐   /internal/* + token   ┌──────────────┐
│     web      │ ──────────────────► │     api      │ ──────────────────────► │    agents    │
│   Next.js    │ ◄──── SSE stream ── │     Hono     │ ◄──── NDJSON stream ─── │    Mastra    │
│   :3000      │                     │    :8000     │                         │    :8111     │
└──────────────┘                     └──┬────┬───┬──┘                         └──────┬───────┘
                                        │    │   │                                   │
                                  Prisma│    │   │pub/sub, cache, limits             │ memory
                                        ▼    │   ▼                                   ▼
                                    ┌──────┐ │ ┌────────┐                      ┌──────────┐
                                    │MySQL │ │ │ Valkey │                      │ Postgres │
                                    └──────┘ │ └────────┘                      └──────────┘
                                             │
                       MinIO/S3 (avatars) · SMTP/Mailpit or SES (email) · Stripe (payments)
```

There are **three apps** and **five data services**:

| Piece               | What it does                                                                                                         | Who can reach it                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **web** (Next.js)   | The website. Pages, forms, chat UI. Holds no secrets and never touches a database.                                   | Everyone (public)                               |
| **api** (Hono)      | The brain of the product: users, sessions, credits, payments, chat threads, the event log, streaming to the browser. | Everyone (public), protected by auth            |
| **agents** (Mastra) | Runs the AI model and keeps the AI's conversation memory. Knows nothing about money or users' accounts.              | Only the api (internal token)                   |
| **MySQL**           | Main product database (users, credits, threads...).                                                                  | api only                                        |
| **Postgres**        | Memory store for the AI (messages the model remembers, per-user notes).                                              | agents only                                     |
| **Valkey**          | Fast in-memory store: session cache, rate limits, one-time codes, live chat fan-out.                                 | api only                                        |
| **MinIO**           | File storage with the same API as Amazon S3 (avatars).                                                               | api, plus browsers via short-lived signed links |
| **Mailpit**         | A fake email server for local development. Catches every email so you can read it in a web page.                     | api sends, you read                             |

### 2.2 Why split into three apps?

- **web vs api**: the browser code is public; anything secret (database passwords, JWT secret, Stripe keys) must live on a server the user cannot see. Splitting also means the API can serve a mobile app later with no changes.
- **api vs agents**: AI runtimes change fast and use lots of memory and CPU. Keeping the model in its own service means you can swap Mastra, change models, or scale the AI service separately, **without touching the code that handles money**. The agents service only reports "I used N tokens"; the api decides what to charge. See `docs/decisions.md` (decision 004).

### 2.3 Why two databases (MySQL and Postgres)?

This is a common interview question, so here is the honest answer:

- **MySQL** holds the product data. It is the "source of truth" for anything the business cares about.
- **Postgres** holds Mastra's memory tables. Mastra's storage adapter we use is `@mastra/pg` (Postgres), and Mastra creates and migrates its own tables (you will see dozens of `mastra_*` tables).
- Keeping them apart means Mastra's schema changes can never break product tables, and the AI service has **no credentials** to the product database at all. That is a real security boundary: if the AI service is compromised, users' passwords and credit ledger are not reachable from it.

The trade-off is running two database engines. For a single-person project you could put both in Postgres. The split mirrors how larger teams isolate a fast-moving subsystem.

### 2.4 How data flows for one chat message (short version)

1. Browser `POST /v1/agents/ask-ai/threads` with the message.
2. api checks credits, creates the thread, **claims** the thread (only one answer at a time), writes `message.user` and `turn.started` events to MySQL, replies `201` immediately.
3. In the background, api calls agents `POST /internal/agents/ask-ai/turn/stream`.
4. agents runs the model and streams back lines of JSON (NDJSON): many `text-delta`, then one `finish` with token usage.
5. api publishes each delta to Valkey pub/sub (so whichever api server holds the browser's connection can forward it).
6. Browser holds an SSE connection `GET .../events?cursor=N` and receives the deltas live.
7. When done, api charges credits (safe to retry), writes `message.assistant`, releases the claim, and asks agents for a short title.

The long version is in [section 10.3](#103-a-chat-turn).

### 2.5 Scaling story

- **web**: stateless, run as many copies as you want.
- **api**: also stateless. Any copy can run a chat turn, and any copy can hold a browser's stream, because live traffic goes through Valkey pub/sub. Cancel signals also go through pub/sub, so "Stop" works even when the stop request lands on a different server than the one running the turn. A crashed server's half-finished turns are cleaned up by a sweep that runs every minute on every copy.
- **agents**: stateless per request (memory lives in Postgres), scale freely.
- **MySQL**: the ledger uses a per-user row lock, so users never block each other.
- **Valkey**: the client supports Redis Cluster / AWS ElastiCache cluster mode.

---

## 3. Folder map: what lives where

```
.
├── apps/
│   ├── api/                 Hono REST API (the product backend)
│   │   ├── Dockerfile       multi-stage image: builder, migrator, runtime
│   │   └── src/
│   │       ├── index.ts         starts the server, sweep timer, graceful shutdown
│   │       ├── app.ts           builds the HTTP app: middleware order + routes
│   │       ├── container.ts     the ONLY place objects are wired together
│   │       ├── lib/             config, jwt, password, rate limiter, redis, storage, logger
│   │       ├── middleware/      auth, error handler, request id, request logger, rate limit
│   │       ├── routes/          health + v1/{auth,users,credits,agents,webhooks}
│   │       ├── services/        business logic (auth, session, otp, credit, payment, email, user)
│   │       │   └── agents/      agents client, thread directory, Ask AI (turn runner, SSE, events)
│   │       ├── scripts/         export-openapi, grant-credits (operator CLI)
│   │       ├── seeds/           credit packages seed (safe to run every deploy)
│   │       └── test/            test env setup + in-memory fakes
│   ├── agents/              Mastra AI runtime (internal only)
│   │   └── src/
│   │       ├── lib/             config, constant-time token check
│   │       └── mastra/
│   │           ├── index.ts     the Mastra instance: agents, storage, routes, middleware
│   │           ├── agents/      Ask AI agent + thread-title agent
│   │           ├── routes/      /internal/* routes + health
│   │           ├── tools/       current_time tool (example tool)
│   │           ├── models.ts    model choice + offline mock model
│   │           ├── storage.ts   Postgres memory store
│   │           └── logger.ts    pino logger
│   └── web/                 Next.js frontend
│       └── src/
│           ├── app/[locale]/    pages (every URL starts with /en or /es)
│           │   ├── auth/        sign-in, sign-up, verify-email, forgot-password
│           │   └── (app)/       signed-in area: chat, chat/[threadId], account, account/billing
│           ├── components/      app shell (sidebar, user menu), shadcn/ui primitives, providers
│           ├── hooks/           data hooks (current user, credits, thread list, sign out)
│           ├── i18n/            locales, routing, en.json / es.json messages
│           ├── lib/             api client, endpoints, config, safe redirect, query keys
│           ├── stores/          zustand auth store
│           └── proxy.ts         edge routing: locale + optimistic auth redirects
├── packages/                code shared between apps (each is a tiny npm package)
│   ├── shared-prisma/       schema.prisma, migrations, Prisma client
│   ├── shared-schemas/      Zod contracts: the single source of truth for API shapes
│   ├── shared-utils/        AppError + error codes, localized email templates
│   ├── shared-cache/        Valkey/Redis clients, cache helper, health check
│   ├── shared-storage/      S3/MinIO file storage
│   ├── shared-audit/        append-only audit log writer
│   └── shared-logger/       Winston logger (pretty in dev, JSON in prod)
├── scripts/                 e2e smoke test (register → chat → billing → logout)
├── docs/                    architecture.md and decisions.md
├── docker-compose.yml       the whole local stack
├── Makefile                 human-friendly commands (`make help`)
├── turbo.json               build order and caching rules
├── package.json             workspaces + root scripts
├── tsconfig.base.json       TypeScript settings every package extends
├── eslint.config.mjs        lint rules for Node packages
├── .prettierrc              formatting rules
├── .env.example             every setting, documented
├── .github/workflows/ci.yml CI pipeline
├── .nvmrc                   Node version (22)
├── .yarnrc.yml              Yarn settings
├── .gitattributes           force LF line endings
├── .dockerignore            keep node_modules, .env etc. out of images
└── .gitignore
```

**Rule of thumb:** `apps/` are things you deploy. `packages/` are libraries the apps import. Apps never import from each other; they talk over HTTP.

---

## 4. Developer tooling

Each tool below has four parts: **what it is**, **how we use it here**, **why this one**, and **what else we could have used**.

### 4.1 Node.js 22

- **What:** the JavaScript runtime that runs the api, agents and the Next.js server.
- **How:** `.nvmrc` says `22`; every `package.json` has `"engines": { "node": ">=22.13.0" }`; Dockerfiles use `node:22-bookworm-slim`.
- **Why 22:** it is an LTS (long-term support) release. It has built-in `fetch`, `AbortSignal.timeout`, `node:test`-grade tooling, stable ESM. The e2e script needs zero npm packages because Node 22 has `fetch` built in.
- **Alternatives:** Bun or Deno are faster to start and have built-in tooling, but some libraries (Prisma 5, Next.js internals, the AWS SDK) are best tested on Node. For a hiring review, "boring and supported" wins.

### 4.2 Corepack

- **What:** a tool shipped with Node that installs the exact package manager version a project asks for.
- **How:** root `package.json` has `"packageManager": "yarn@4.9.2"`. The Makefile runs `corepack yarn ...`, and CI runs `corepack enable`.
- **Why:** everybody (you, CI, Docker, the hiring manager) uses the **same** Yarn version, with no global install needed.

### 4.3 Yarn 4 (Berry) with workspaces

- **What:** the package manager. It installs dependencies and links our local packages together.
- **How:**
  - `"workspaces": ["apps/*", "packages/*"]` in the root `package.json` tells Yarn every folder there is its own package.
  - Apps depend on shared packages with `"@boilerplate/shared-schemas": "workspace:*"`, which means "use the local copy, always".
  - `.yarnrc.yml` sets `nodeLinker: node-modules` (a classic `node_modules` folder instead of Yarn's Plug'n'Play), turns telemetry off, and lists `supportedArchitectures` so the lockfile contains binaries for macOS **and** Linux, Intel **and** ARM. That matters because you develop on a Mac but Docker builds on Linux.
  - `resolutions` pins `zod` to `3.25.76` everywhere, so there is exactly one Zod in the tree. Two copies would break `instanceof` checks and schema sharing.
  - `yarn install --immutable` in CI fails if `yarn.lock` is out of date, so what you tested is what ships.
  - Dockerfiles use `yarn workspaces focus <app>` to install **only** what one app needs, which keeps images small.
- **Why Yarn over npm/pnpm:** Yarn 4 has solid workspaces, `workspaces focus` for lean Docker installs, and `yarn run -T` to run root tools (ESLint) from any package.
- **Alternatives:** **pnpm** is the most popular choice today and saves disk with a content-addressed store; it would work equally well. **npm workspaces** work but lack `focus` and are slower. This is a matter of taste; be ready to say "pnpm would be fine too."

### 4.4 Turborepo (turbo)

- **What:** a task runner for monorepos. It knows which packages depend on which, runs tasks in the right order, in parallel, and **caches** results.
- **How:** `turbo.json`:
  - `"build": { "dependsOn": ["^build"] }`: the `^` means "first build everything I depend on". So `api` builds only after `shared-prisma`, `shared-schemas`, etc. are built.
  - `outputs` lists what to cache (`dist/**`, `.next/**`, `.mastra/output/**`). If nothing changed, turbo replays the cached output ("FULL TURBO").
  - `lint`, `type-check` and `test` also depend on `^build`, because shared packages are consumed from their compiled `dist/` folder.
  - `dev` is `persistent` and never cached.
  - `globalEnv: ["NODE_ENV"]` makes the cache aware of `NODE_ENV`.
- **Why:** without it, you would have to remember to rebuild `shared-schemas` before the web app, and every CI run would rebuild everything.
- **Alternatives:** **Nx** (more features, code generators, heavier), **Lerna** (older), plain `yarn workspaces foreach` (no caching). Turbo is the lightest tool that gives ordering plus caching.

### 4.5 TypeScript

- **What:** JavaScript with types. Catches mistakes before running the code.
- **How:**
  - `tsconfig.base.json` is shared by every package: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `isolatedModules` (so fast transpilers like tsx/esbuild are safe), `moduleResolution: "bundler"`, target ES2022.
  - Packages build with `tsc` into `dist/` with `.d.ts` type files and source maps.
  - `apps/api` has `tsconfig.json` (type-check only, includes tests) and `tsconfig.build.json` (emits JS, excludes tests).
  - `apps/web` has its own config because Next.js needs `jsx`, DOM types and the `@/*` path alias.
  - All code is **ES modules** (`"type": "module"`). That is why imports end in `.js` even in `.ts` files: Node resolves the compiled file name.
- **Why:** a monorepo that shares types between frontend and backend only pays off with strict typing.
- **Alternatives:** plain JavaScript with JSDoc types. Not a serious option for a project this size.

### 4.6 ESLint (flat config)

- **What:** a linter. It finds bugs and bad patterns that the compiler allows.
- **How:**
  - Root `eslint.config.mjs` (the new "flat" config format of ESLint 9) covers api, agents and packages: recommended JS rules + `typescript-eslint` recommended, plus our rules:
    - `consistent-type-imports`: type-only imports use `import type`, so they vanish at runtime.
    - `no-unused-vars` except names starting with `_`.
    - `no-explicit-any` as a warning (off in tests).
    - `no-console` except `warn`/`error` (use the logger instead).
    - `eqeqeq: smart`: always `===`, except `== null`.
  - `apps/web/eslint.config.mjs` uses `eslint-config-next` (core web vitals + TypeScript) which adds React, hooks and Next.js rules.
  - Each package's `lint` script runs `yarn run -T eslint src`; `-T` means "use the ESLint installed at the root".
- **Alternatives:** **Biome** (one fast tool for lint + format, fewer rules, weaker React/Next plugin coverage) or **oxlint**. ESLint is the default that reviewers know.

### 4.7 Prettier

- **What:** an automatic code formatter. It ends arguments about style.
- **How:** `.prettierrc`: single quotes, semicolons, trailing commas where ES5 allows, `printWidth: 150` (long lines, fits wide screens), `arrowParens: avoid` (`x => x`), LF line endings.
  - `yarn format` rewrites files. `yarn format:check` only checks, and **CI now runs it**, so unformatted code fails the build.
- **Why separate from ESLint:** ESLint finds bugs; Prettier only formats. Mixing them causes rule fights.
- **Alternatives:** Biome's formatter (compatible, faster), dprint.

### 4.8 Vitest

- **What:** the test runner.
- **How:** each package has `vitest.config.ts`.
  - api: Node environment, `setupFiles` sets a fixed test env, `pool: 'forks'` (each file in its own process, so module-level singletons do not leak), coverage via V8.
  - web: `jsdom` environment (a fake browser) with React Testing Library and `jest-dom` matchers.
  - agents: runs a **real Mastra agent** against the mock model.
  - Integration tests (`credit.service.integration.test.ts`) skip themselves unless `TEST_DATABASE_URL` is set, so `yarn test` works with no database.
- **Why:** native ESM and TypeScript with no Babel setup, the same config style as Vite, a Jest-compatible API, fast watch mode.
- **Alternatives:** **Jest** (the classic, but ESM + TypeScript support needs more configuration), **node:test** (built in but thin tooling).

### 4.9 Make (the Makefile)

- **What:** an old, universal command runner. Here it is just a menu of shortcuts.
- **How:** `make help` prints every target with a description (parsed from the `## comments`). Groups: full stack in Docker (`up`, `down`, `reset`, `logs`...), local development (`infra`, `setup`, `dev`), database (`db-migrate`, `db-seed`, `db-studio`, `credits`), quality gates (`lint`, `test`, `test-integration`, `e2e`, `check`).
  - `WITH_ENV` loads the root `.env` into the shell before host-side tools run, because the Prisma CLI and the seed script do not read the root `.env` on their own.
  - `s=api` lets you target one service: `make logs s=api`.
- **Why:** a reviewer can type `make up` without reading anything. Make is preinstalled on macOS and Linux.
- **Alternatives:** `just` (nicer syntax, needs install), npm scripts only (fine, but the Docker commands get long).

### 4.10 Docker (the Dockerfiles)

- **What:** packages each app with its exact runtime into an "image" that runs the same everywhere.
- **How:** each app has a **multi-stage** Dockerfile (build context is the repo root):
  1. `base`: `node:22-bookworm-slim` + `tini` + `ca-certificates` (+ `openssl` for Prisma in the api).
  2. `manifests`: copy only `package.json` files and `yarn.lock` first. Docker caches this layer, so dependencies reinstall only when a `package.json` changes, not when you edit code.
  3. `builder`: install with `yarn workspaces focus`, copy sources, run `turbo build` for that app and its dependencies (`--filter=@boilerplate/api...`).
  4. **api only:** `migrator` stage runs `prisma migrate deploy` then the seed. It runs once per deploy, before the api starts.
  5. `prod-deps` (api): reinstall with `--production`, so dev tools are not in the final image.
  6. `runtime`: copy only built files, `USER node` (not root), `HEALTHCHECK` using Node's `fetch`, `ENTRYPOINT tini`.
  - **tini** is a tiny init process. It forwards `SIGTERM` to Node and reaps zombie processes, so graceful shutdown actually works in containers.
  - `RUN --mount=type=cache` keeps Yarn's download cache between builds.
  - web uses Next.js `output: 'standalone'`, which produces a minimal server with only the files it needs.
  - agents uses `mastra build`, which produces a self-contained bundle in `.mastra/output` with its own `node_modules`.
- **Alternatives:** Alpine images (smaller, but musl libc sometimes breaks native modules and Prisma), distroless (smaller and safer, no shell for debugging), Nixpacks/Buildpacks (less control).

### 4.11 Docker Compose

- **What:** starts many containers together with one command.
- **How:** `docker-compose.yml` defines the data tier (mysql, postgres, valkey, minio, mailpit) and the app tier (migrate, api, agents, web).
  - Every value has a working default (`${JWT_SECRET:-local-dev-...}`), so `make up` works with **no `.env` at all**.
  - `depends_on` with `condition: service_healthy` / `service_completed_successfully` creates a strict start order: mysql healthy → migrate finishes → api starts → web starts.
  - All ports are bound to `127.0.0.1` only, so nothing is exposed to your Wi-Fi network.
  - Named volumes (`mysql_data`, ...) keep data between restarts. `make reset` deletes them.
  - `x-internal-token: &internal-token` is a YAML anchor so api and agents share one token value.
  - Host ports are overridable (`WEB_PORT`, `API_PORT`...) when they clash with something on your machine.
- **Alternatives:** Kubernetes with kind/minikube (overkill locally), Tilt, devcontainers.

### 4.12 GitHub Actions (CI)

- **What:** runs checks automatically on every pull request and push to `main`.
- **How:** `.github/workflows/ci.yml` has three jobs:
  1. **quality**: install (`--immutable`), `format:check`, build packages, lint, type-check, unit tests, full build, and a check that `schema.prisma` and the migrations are in sync (`prisma migrate diff --exit-code` against a throwaway MySQL). That last step catches "I changed the schema but forgot to create a migration".
  2. **integration**: starts a real MySQL, applies migrations, runs the ledger tests that need real row locks (10 concurrent debits against a balance of 5 must produce exactly 5 successes).
  3. **e2e**: builds the whole Docker stack, runs `scripts/e2e-smoke.mjs`, prints logs on failure, then tears down.
  - `concurrency` cancels older runs of the same branch. `permissions: contents: read` gives the workflow the least access it needs.
- **Alternatives:** GitLab CI, CircleCI. The ideas are the same.

### 4.13 The small dot-files

| File             | Purpose                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.nvmrc`         | Node version for `nvm use` and for CI's `setup-node`.                                                                                                     |
| `.gitattributes` | Forces LF line endings, marks images as binary. Stops Windows editors from breaking shell scripts.                                                        |
| `.dockerignore`  | Keeps `node_modules`, build output, `.git` and `.env` files out of Docker build context, which makes builds faster and stops secrets leaking into images. |
| `.gitignore`     | Ignores dependencies, build output, `.env*` (except `.env.example`), coverage, editor folders.                                                            |
| `.env.example`   | The documented list of every setting. Copy to `.env` for host development.                                                                                |

---

## 5. Infrastructure services

### 5.1 MySQL 8.4 (product database)

- **What:** a relational database. Tables, rows, transactions.
- **How:** image `mysql:8.4` (an LTS line), started with `utf8mb4` so emoji and every language store correctly. Tables are created only by Prisma migrations. There are four "bounded contexts" in the schema (see [7.1](#71-shared-prisma-the-database)): Identity, Audit, Credits, Agents.
- **Why MySQL:** it is widely used, well understood, and has strong row locking (`SELECT ... FOR UPDATE`), which the credit ledger depends on. It maps well to managed services like AWS RDS/Aurora MySQL and PlanetScale.
- **Alternatives:** **Postgres** would work equally well (and would let you run one engine for everything). SQLite is too limited for concurrent writes. MongoDB lacks the transactional guarantees a money ledger wants.

### 5.2 Prisma 5 (ORM and migrations)

- **What:** a tool that turns a schema file into a typed database client and SQL migrations.
- **How:**
  - `packages/shared-prisma/prisma/schema.prisma` describes every table. `prisma generate` creates a TypeScript client with exact types for every table.
  - `prisma migrate dev --name x` (via `make db-migrate-new name=x`) compares the schema with the database and writes a new SQL migration.
  - `prisma migrate deploy` (via `make db-migrate` or the Docker `migrate` container) applies pending migrations. It never generates anything, so it is safe in production.
  - `binaryTargets` includes Linux x64 and ARM so the query engine works in Docker on any machine.
  - Some queries use raw SQL on purpose, for example the row lock `SELECT id FROM users WHERE id = ? FOR UPDATE`. Prisma's tagged template (`$queryRaw\`...${userId}\``) **parameterizes** values, so this is not SQL-injectable.
- **Why:** end-to-end types from the database to the API, readable schema, reliable migrations.
- **Alternatives:** **Drizzle** (lighter, closer to SQL, no separate engine binary), **Kysely** (typed query builder), **TypeORM** (older, decorator-heavy). Prisma 6/7 exists; this repo pins 5.22 for stability. Upgrading is a known follow-up.

### 5.3 PostgreSQL 16 (AI memory)

- **What:** another relational database.
- **How:** used only by the agents service through `@mastra/pg` (`PostgresStore`). Mastra creates its own tables in the `mastra` schema: threads, messages, resources (per-user working memory), plus many tables for features we do not use yet. Host port is `5433` so it does not clash with a Postgres you may already run on `5432`.
- **Why separate:** see [2.3](#23-why-two-databases-mysql-and-postgres).
- **Alternatives:** Mastra also supports LibSQL/SQLite, Upstash, MongoDB and others.

### 5.4 Valkey 8 (Redis-compatible cache and messaging)

- **What:** an in-memory key-value store. Valkey is the open-source fork of Redis, created in 2024 by the Linux Foundation after Redis changed its license. It speaks the exact same protocol.
- **How:** started with `--appendonly yes` so data survives restarts. The api uses it for:

  | Use                     | Key pattern                      | Why Valkey                                    |
  | ----------------------- | -------------------------------- | --------------------------------------------- |
  | Session validity cache  | `session:<jti>`                  | Avoids a MySQL query on every request         |
  | "Last used" throttle    | `session-touch:<jti>`            | Write `last_used_at` at most every 10 minutes |
  | One-time codes (hashed) | `otp:<purpose>:<email>`          | Built-in expiry (TTL)                         |
  | Guess counter           | `otp-attempts:<purpose>:<email>` | Atomic `INCR`                                 |
  | Resend cooldown         | `otp-cooldown:<purpose>:<email>` | TTL                                           |
  | Rate limits             | `rate:<rule>:<id>`               | Sorted set + Lua script, atomic               |
  | Live chat fan-out       | channel `ask-ai:thread:<id>`     | Pub/sub across api servers                    |
  | Stop button             | channel `ask-ai:cancel:<turnId>` | Reaches the server running the turn           |
  | Mid-answer snapshot     | `ask-ai:turn-snapshot:<turnId>`  | Late viewers catch up                         |
  | Health check            | `healthcheck:api:<host>`         | Proves writes work, not just PING             |

- The client library is **iovalkey** (the Valkey fork of `ioredis`). There are **two connections**: one for normal commands and one dedicated to `SUBSCRIBE`, because a subscribed connection cannot run other commands.
- **Why:** sub-millisecond reads, TTLs, atomic operations, and pub/sub in one tool.
- **Alternatives:** **Redis** itself (same thing, license changed and then partly reverted in 2025), **KeyDB**, **Dragonfly**. For pub/sub only, NATS. For rate limits only, a database table (slower).

### 5.5 MinIO (S3-compatible file storage)

- **What:** a server that speaks the Amazon S3 API. Locally it plays S3; in the cloud you point the same code at real S3.
- **How:** `packages/shared-storage` wraps the AWS SDK. `STORAGE_PROVIDER=minio` uses an endpoint + static keys; `STORAGE_PROVIDER=s3` uses the AWS default credential chain (IAM roles), so no keys live in config. The bucket is **private**. Browsers get **presigned URLs**: links signed by the server that expire (1 hour for avatars). The api creates the bucket on boot if it is missing.
  - There are two S3 clients: one for the server (in Docker it talks to `http://minio:9000`) and one for signing links with the **public** endpoint (`http://localhost:9000`), because a browser cannot resolve the Docker hostname `minio`.
  - The console at http://localhost:9001 (login `minioadmin` / `minioadmin`) lets you browse uploaded files.
- **Important 2026 note:** MinIO stopped publishing free community Docker images in October 2025, and `minio/minio` was **deleted from Docker Hub in September 2026**. The compose file now uses `cgr.dev/chainguard/minio:latest`, a free rebuild of MinIO from source by Chainguard (only the `latest` tag is free).
- **Alternatives:** **SeaweedFS**, **Garage**, **RustFS**, or LocalStack for S3 emulation. Because all code uses the plain S3 API, switching is a compose change, not a code change.

### 5.6 Mailpit (local email catcher)

- **What:** a fake SMTP server with a web inbox.
- **How:** the api sends email over SMTP to `mailpit:1025`. Open http://localhost:8025 to read every email, including OTP codes. The e2e test reads codes through Mailpit's HTTP API. Image pinned to `axllent/mailpit:v1.31`.
- **Why:** you can test sign-up without a real email provider, and no real email ever leaves your machine.
- **Alternatives:** MailHog (unmaintained), Mailtrap (hosted), MailDev.

### 5.7 Email in production: SMTP or AWS SES

- `EMAIL_TRANSPORT=smtp` works with any provider (Postmark, SendGrid, Mailgun...) through **nodemailer**.
- `EMAIL_TRANSPORT=ses` uses the AWS SDK and IAM role credentials.
- Templates are Handlebars files in `packages/shared-utils/src/email-templates/templates/<name>/<locale>.{html,txt}`, with a shared header and footer. Every email has both an HTML and a plain-text part (better deliverability and accessibility).

### 5.8 Stripe (payments)

- **What:** payment provider.
- **How:** Stripe **Checkout** (a hosted payment page). The api creates a Checkout Session and a local `payments` row, then redirects the browser to Stripe. Credits are granted **only** from the webhook `POST /v1/webhooks/stripe`, after verifying Stripe's signature on the raw body. The grant uses the idempotency key `payment:<id>`, so Stripe resending the same event can never grant twice. If `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing, checkout is shown as disabled.
- **Why:** hosted Checkout keeps card data off our servers (much smaller PCI scope).
- **Alternatives:** Paddle or Lemon Squeezy (they act as merchant of record and handle sales tax), Stripe Elements (embedded form, more work).

### 5.9 OpenRouter (real AI models)

- **What:** one API key that gives access to models from many vendors (OpenAI, Anthropic, Google, Meta...).
- **How:** set `AGENTS_MODEL_PROVIDER=openrouter` and `OPENROUTER_API_KEY`. Models are strings like `openrouter/openai/gpt-4o-mini`, resolved by Mastra's model router. Changing model is a config change.
- **Default:** `mock`, an offline fake model built with the AI SDK's `MockLanguageModelV3`. It streams word by word and reports token usage like a real model, and it runs through the **real** Mastra agent path, so streaming and billing are tested the same way.

### 5.10 Google sign-in (optional)

- The web app shows the Google button only when the api reports a `GOOGLE_CLIENT_ID`. The browser gets an **ID token** from Google Identity Services and sends it to `POST /v1/auth/google`. The api verifies signature, audience, expiry and issuer with `google-auth-library`, requires `email_verified`, links or creates the account, and issues our own session.

---

## 6. The three apps

### 6.1 `apps/api`: the product backend (Hono)

**Start of the program:** `src/index.ts`

1. Connect both Valkey clients and MySQL.
2. Make sure the storage bucket exists.
3. `createApp(container)` builds the HTTP app.
4. Start listening, then run `sweepStaleTurns` now and every 60 seconds.
5. On `SIGTERM`/`SIGINT`: stop accepting connections, abort running chat turns (they settle as "interrupted"), close Valkey and MySQL, exit.

**The composition root:** `src/container.ts`

This is the only file that creates real objects (`new SessionService(prisma, redis, ...)`) and hands them to each other. Every service receives what it needs through its constructor. That is why tests can pass fakes instead of a real database (see [9.2](#92-dependency-injection-with-a-composition-root)).

**Middleware order:** `src/app.ts`

Order matters. Each request passes through, top to bottom:

| #   | Middleware             | Job                                                                                                      |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `requestId`            | Give every request an id (or accept a sane upstream one). Returned as `x-request-id`.                    |
| 2   | `requestLogger`        | One structured log line per request: method, path, status, time, user, anonymized IP.                    |
| 3   | `secureHeaders`        | Security headers (no sniffing, frame protection, etc.).                                                  |
| 4   | `cors`                 | Only `CORS_ORIGINS` may call with cookies.                                                               |
| 5   | `csrf`                 | Reject cross-site form posts.                                                                            |
| 6   | `bodyLimit`            | 3 MB for avatar uploads, 1 MB for everything else under `/v1`.                                           |
| 7   | `authenticate`         | If a valid token is present, put `{ userId, sessionId, email }` on the request. Never rejects by itself. |
| 8   | Routes                 | Each router adds `requireAuth` where needed.                                                             |
| 9   | `notFound` / `onError` | Turn any error into the standard error envelope.                                                         |

**Routes** (`src/routes`), all documented at http://localhost:8000/doc:

| Area     | Endpoints                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health   | `GET /health/live` (process up), `GET /health/ready` (MySQL + Valkey), `GET /health` (full report)                                                                                    |
| Auth     | `providers`, `register`, `verify-email`, `login`, `otp/send`, `otp/sign-in`, `password/reset`, `google`, `me`, `logout`, `logout-all`, `password/change`, `sessions`, `sessions/{id}` |
| Users    | `PATCH /me`, `POST /me/avatar`, `DELETE /me/avatar`                                                                                                                                   |
| Credits  | `balance`, `transactions`, `packages`, `checkout`                                                                                                                                     |
| Agents   | `threads` list/get/patch/delete, `threads/{id}/messages`, `threads/{id}/cancel`, `ask-ai/threads` (create), `ask-ai/threads/{id}/events` (SSE)                                        |
| Webhooks | `POST /v1/webhooks/stripe`                                                                                                                                                            |

Routes are **thin**: validate input (automatically, from the Zod schema), call a service, shape the response. All business rules live in `src/services`.

**Services** (`src/services`):

| Service                      | Responsibility                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.service.ts`            | Every identity use case: register, verify, login, OTP sign-in, reset, change password, Google, logout. Also first activation (bonus credits + welcome email). |
| `session.service.ts`         | Server-side sessions behind the JWT. MySQL is the truth, Valkey caches validity.                                                                              |
| `otp.service.ts`             | 6-digit codes: generate, hash, store, email, verify with a guess limit.                                                                                       |
| `user.service.ts`            | Profile, avatar upload (magic-number check), presigned avatar URLs.                                                                                           |
| `credit.service.ts`          | The ledger: balance, grant, debit, history.                                                                                                                   |
| `payment.service.ts`         | Stripe Checkout and webhook handling.                                                                                                                         |
| `email.service.ts`           | SMTP or SES transport.                                                                                                                                        |
| `google-auth.service.ts`     | Verifies Google ID tokens.                                                                                                                                    |
| `agents/agents-client.ts`    | HTTP client to the agents service (NDJSON reader).                                                                                                            |
| `agents/thread-directory.ts` | Domain-agnostic thread list: ownership, search, favorites, keyset paging.                                                                                     |
| `agents/ask-ai/*`            | Conversation use cases, turn runner, event store, stream hub, SSE writer, pricing.                                                                            |

### 6.2 `apps/agents`: the AI runtime (Mastra)

**What Mastra is:** a TypeScript framework for AI agents. It gives you an `Agent` (instructions + model + tools + memory), a `Memory` system backed by storage, streaming built on the Vercel AI SDK, and an HTTP server you can add routes to. `mastra dev` runs a hot-reloading dev server with a Studio UI; `mastra build` bundles a production server.

**How we use it:**

- `src/mastra/index.ts` creates one `Mastra` instance with two agents, Postgres storage, a pino logger, and our routes.
- **Ask AI agent** (`agents/ask-ai-agent.ts`): instructions, the `current_time` tool, and memory:
  - `lastMessages: 20`: the model sees the last 20 messages of the thread.
  - **Working memory** with `scope: 'resource'`: a small "user profile" note the model can update. Resource = our user id, so facts carry across all of a user's threads, while message history stays per thread.
- **Thread title agent**: no tools, no memory, returns structured output `{ title }`, cleaned up by `cleanThreadTitle`.
- **Routes** (all check the internal token, compared in constant time):
  - `POST /internal/agents/ask-ai/turn/stream`: run one turn, stream NDJSON.
  - `POST /internal/agents/thread-title/generate`: return a title.
  - `GET /internal/agents/health`, and public `GET /health/live`.
- **Server middleware** `requireInternalToken`: Mastra also serves its own built-in API (`/api/agents`, `/api/memory/...`). Without this guard, anyone who could reach port 8111 could read every user's memory and run the model on your key. The guard requires the token everywhere except `/health/live`. It is relaxed only when `NODE_ENV=development`, so Mastra Studio still works during `make dev`.
- **If the api disconnects** (user pressed Stop), the request's abort signal cancels the model call, so you stop paying for tokens.

**Why Mastra:** agents, memory with working memory, tools, streaming and storage adapters in one TypeScript package, with a local Studio for debugging.

**Alternatives:** **Vercel AI SDK alone** (great streaming, but you build memory and storage yourself), **LangChain.js / LangGraph.js** (bigger ecosystem, more abstraction), **OpenAI Agents SDK** (vendor-leaning), or calling the provider's API directly (most control, most code).

### 6.3 `apps/web`: the frontend (Next.js 16)

- **App Router** with a `[locale]` segment, so every URL starts with `/en` or `/es`.
- `(app)` is a **route group** (the parentheses do not appear in the URL). Its layout wraps pages in `AppShell` + `AuthGate`.
- **`src/proxy.ts`** (Next 16 renamed "middleware" to "proxy") runs before every page: it negotiates the locale, then does **optimistic** auth redirects based only on whether the cookie exists. It cannot validate the cookie (it is httpOnly and signed by the api); that is the api's job on every call.
- **`AuthGate`** confirms the session with `GET /v1/auth/me` before rendering the signed-in area, and registers a global handler so any later `401` signs the user out and returns to sign-in with `?next=`.
- **Data fetching** goes through one wrapper, `lib/api/client.ts` (`credentials: 'include'`, error envelope → `ApiError`), and a typed endpoint map in `lib/api/endpoints.ts`, whose types come from `shared-schemas`.
- **Chat streaming:** `use-thread-stream.ts` owns an `EventSource`, validates every frame with Zod, watches heartbeats (reconnects after 45 s of silence) and reconnects with exponential backoff, always resuming from the last cursor. `thread-reducer.ts` is a pure function that turns events + frames into UI state, and it is safe against duplicates and replays.
- **Markdown** from the model is rendered with `react-markdown` **without raw HTML**, and `javascript:`/`data:` links are removed.
- Next.js config: `output: 'standalone'`, `reactCompiler: true`, `poweredByHeader: false`, security headers (`nosniff`, `X-Frame-Options: DENY`, referrer policy, permissions policy).

---

## 7. The shared packages

Each package is built with `tsc` into `dist/`, has an `exports` map, and is imported as `@boilerplate/<name>`. Keeping them small and focused means each app pulls in only what it uses (the web app only depends on `shared-schemas`).

### 7.1 `shared-prisma`: the database

- `prisma/schema.prisma` + `prisma/migrations/` (one migration so far: `20260928000000_init`).
- `createPrismaClient(url)` normalizes the connection string (URL-encodes odd characters in passwords, a common secret-manager problem).
- A process-wide singleton, kept on `globalThis` outside production, so hot reload does not open a new connection pool every time.
- Re-exports the generated client, so apps depend on this package only.

**The data model, in four bounded contexts:**

| Context  | Tables                                                                                                                    | Notes                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity | `users`, `user_sessions`, `oauth_accounts`                                                                                | `status`: pending → active (or banned/deactivated). Password is a bcrypt hash, null for SSO-only users. Avatar stores an object **key**, never a URL. |
| Audit    | `audit_logs`                                                                                                              | Append-only: who did what, from which IP/user agent, request id.                                                                                      |
| Credits  | `credit_sources`, `credit_transactions`, `credit_transaction_sources`, `credit_usage_logs`, `credit_packages`, `payments` | Amounts are `DECIMAL(18,6)`, never floats. `idempotency_key` is UNIQUE.                                                                               |
| Agents   | `agent_threads`, `ask_ai_conversations`, `ask_ai_thread_events`, `agent_token_usage`                                      | Event log with a gap-free cursor per conversation. `activeTurnId` is the "one answer at a time" lock.                                                 |

Conventions: model names in PascalCase, tables in snake_case via `@@map`, user ids `UNSIGNED BIGINT` everywhere, indexes named explicitly and designed for the actual queries (for example the sidebar index `(user_id, is_deleted, last_message_at DESC, id)`).

### 7.2 `shared-schemas`: the contracts

Zod schemas for every request and response: auth, users, credits, Ask AI (public web↔api contract **and** internal api↔agents contract).

- The api validates requests against them and publishes them as **OpenAPI 3.1**.
- The web app imports their **TypeScript types**.
- api and agents validate each other's NDJSON frames with them.

So changing a contract is a compile error on the other side, not a surprise in production.

Notable details: emails are trimmed and lowercased by the schema; password policy is 8–128 characters with a letter and a digit; credit amounts cross the wire as **decimal strings** (JavaScript numbers cannot represent money exactly).

### 7.3 `shared-utils`: errors and email templates

- `AppError` is the one error type services throw. It carries a stable `code` (like `insufficient_credits`), an HTTP status mapped from the code, optional client-safe `details`, and log-only `context`.
- `ERROR_CODES` is part of the public contract: the web app translates each code under `errors.<code>` in `en.json`/`es.json`.
- Email templates: Handlebars with `strict: true` (a missing variable is an error instead of an empty gap in a customer's inbox), HTML-escaped values, English fallback for a missing translation, and a build step that copies template files into `dist/`.

### 7.4 `shared-cache`: Valkey clients

- `createRedisClients` returns `{ redis, subscriber }`, supports TLS (`rediss://`) and auto-detects cluster endpoints.
- `CacheService`: a JSON cache-aside helper that **fails open** (a Valkey outage becomes a cache miss, not an error).
- `checkRedisHealth`: writes and reads back a key with a timeout, which proves more than `PING` (for example, it catches a read-only replica after failover).

### 7.5 `shared-storage`: files

`ObjectStorageService` with `upload`, `download`, `delete`, `getMetadata`, `list`, `getPresignedUrl`, `ensureBucket`. All errors are wrapped in `StorageError`. Metadata values are sanitized to the ASCII subset S3 headers accept.

### 7.6 `shared-audit`: audit trail

`AuditService.record()` is **fire-and-forget**: an audit write failing must never fail the user's request, so it logs loudly instead. `log()` is the awaited version for scripts. `query()` supports filters and pagination.

### 7.7 `shared-logger`: logs

Winston with three modes: colorized single lines in development, one JSON object per line in production (for log collectors like CloudWatch, Datadog, Loki), errors only in tests. `safeStringify` survives `BigInt` (Prisma ids), `Error` objects and circular references, because a logger must never crash while logging.

---

## 8. Libraries and why we chose them

### 8.1 Backend

| Library                                                          | What it does here                                                                             | Why                                                                                                                                                                               | Alternatives                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Hono** + `@hono/node-server`                                   | HTTP framework for the api                                                                    | Small, fast, built on web standards (`Request`/`Response`), first-class streaming (SSE), great TypeScript types, and `app.request()` lets tests run the whole stack with no port. | Express (older, weak types), Fastify (fast, bigger), NestJS (heavy structure) |
| **@hono/zod-openapi**                                            | Routes defined with Zod schemas; validation + OpenAPI doc generated from the same definitions | One definition, three results: validation, types, docs                                                                                                                            | tRPC (no REST/OpenAPI), ts-rest                                               |
| **@hono/swagger-ui**                                             | Interactive docs at `/doc`                                                                    | Try endpoints in the browser                                                                                                                                                      | Scalar, Redoc                                                                 |
| **Zod 3**                                                        | Schema validation everywhere                                                                  | Types inferred from schemas, works in browser and server                                                                                                                          | Valibot (smaller), Yup, ArkType                                               |
| **jsonwebtoken**                                                 | Sign/verify JWTs (HS256, issuer, audience, `jti`)                                             | Mature and simple                                                                                                                                                                 | `jose` (web-standard, works on edge)                                          |
| **bcryptjs**                                                     | Password hashing (cost 12)                                                                    | Pure JS, no native build                                                                                                                                                          | `argon2` (stronger modern choice, native module), `bcrypt` (native)           |
| **nodemailer**                                                   | SMTP email                                                                                    | The standard                                                                                                                                                                      | provider SDKs                                                                 |
| **@aws-sdk/client-ses**, **client-s3**, **s3-request-presigner** | Email via SES, file storage, signed links                                                     | Official, modular v3 SDK                                                                                                                                                          | —                                                                             |
| **stripe**                                                       | Payments                                                                                      | Official SDK                                                                                                                                                                      | —                                                                             |
| **google-auth-library**                                          | Verify Google ID tokens                                                                       | Official                                                                                                                                                                          | `jose` + Google JWKS                                                          |
| **dotenv**                                                       | Load root `.env` on the host                                                                  | Standard                                                                                                                                                                          | Node's `--env-file`                                                           |
| **tsx**                                                          | Run TypeScript directly (dev, seed, scripts)                                                  | Fast (esbuild), zero config                                                                                                                                                       | ts-node, Node's type stripping                                                |
| **winston**                                                      | api logs                                                                                      | Flexible formats                                                                                                                                                                  | pino (faster; used in agents because Mastra's logger wraps pino)              |
| **handlebars**                                                   | Email templates                                                                               | Logic-less, auto-escaping                                                                                                                                                         | MJML, React Email                                                             |

### 8.2 Agents

| Library                                    | Role                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `@mastra/core`                             | Agents, tools, server, routing                           |
| `@mastra/memory`                           | Conversation memory + working memory                     |
| `@mastra/pg`                               | Postgres storage for memory                              |
| `@mastra/loggers` + `pino` + `pino-pretty` | Logging                                                  |
| `ai` + `@ai-sdk/provider`                  | Vercel AI SDK types, and the mock model for offline mode |
| `mastra` (CLI, dev dependency)             | `mastra dev`, `mastra build`                             |

### 8.3 Frontend

| Library                                                      | What it does here                                                                      | Why                                                                   | Alternatives                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| **Next.js 16** (App Router)                                  | Framework: routing, layouts, server rendering, build                                   | Industry default for React, standalone output for Docker              | Remix / React Router 7, Vite SPA, TanStack Start |
| **React 19** + **React Compiler**                            | UI library; the compiler adds memoization automatically                                | Less `useMemo`/`useCallback` noise                                    | —                                                |
| **next-intl**                                                | Translations (`en.json`, `es.json`), locale routing, number/date formatting            | Built for App Router                                                  | next-i18next, Lingui                             |
| **Tailwind CSS v4**                                          | Utility-class styling (config lives in CSS)                                            | Fast to build, consistent                                             | CSS Modules, styled-components                   |
| **shadcn/ui** + **Radix UI**                                 | Copy-in components (button, dialog, dropdown...) on top of accessible Radix primitives | You own the code, accessibility handled (focus traps, ARIA, keyboard) | MUI, Chakra, Mantine                             |
| **TanStack Query**                                           | Server data: caching, loading states, invalidation, infinite lists                     | Removes hand-written fetch state                                      | SWR, RTK Query                                   |
| **Zustand**                                                  | Tiny client store for the resolved user                                                | Minimal API, no provider                                              | React Context, Redux Toolkit, Jotai              |
| **react-hook-form** + **@hookform/resolvers**                | Forms validated with the shared Zod schemas                                            | Fast, few re-renders                                                  | Formik, TanStack Form                            |
| **react-markdown** + **remark-gfm**                          | Render model answers (tables, lists, code) without raw HTML                            | Safe by default                                                       | markdown-it + sanitizer                          |
| **sonner**                                                   | Toast notifications                                                                    | Small, nice defaults                                                  | react-hot-toast                                  |
| **next-themes**                                              | Light/dark/system theme without flashing                                               | Standard                                                              | hand-rolled                                      |
| **lucide-react**                                             | Icons                                                                                  | Tree-shakeable                                                        | Heroicons                                        |
| **use-stick-to-bottom**                                      | Keeps chat scrolled to the newest message while streaming                              | Solves a fiddly UX problem                                            | hand-rolled                                      |
| **@react-oauth/google**                                      | Google sign-in button                                                                  | Wraps Google Identity Services                                        | raw GIS script                                   |
| **clsx** + **tailwind-merge** + **class-variance-authority** | Build class names and component variants                                               | shadcn standard                                                       | —                                                |
| **Vitest** + **jsdom** + **Testing Library**                 | Frontend unit tests                                                                    | Same runner as backend                                                | Jest                                             |

---

## 9. Design patterns we follow

Each pattern: the idea in one line, where to see it, and why.

### 9.1 Monorepo with shared contracts

- **Idea:** all apps and libraries in one repository; request/response shapes defined once.
- **Where:** `packages/shared-schemas`, `workspace:*` dependencies, `turbo.json`.
- **Why:** a change to a contract breaks the build on the other side immediately. One pull request can change api and web together.

### 9.2 Dependency injection with a composition root

- **Idea:** classes never create their own dependencies; they receive them in the constructor. One file wires everything.
- **Where:** `apps/api/src/container.ts`; every service constructor; `src/test/fakes.ts` (in-memory Valkey, silent logger).
- **Why:** swap real infrastructure for fakes in tests, and see the whole dependency graph in one place. No DI framework needed, just constructors.

### 9.3 Layered architecture: thin routes, fat services

- **Idea:** routes parse input and shape output; services hold the rules; Prisma/storage/Valkey are the infrastructure.
- **Where:** compare `routes/v1/auth.ts` (short handlers) with `services/auth.service.ts` (rules).
- **Why:** rules can be tested without HTTP, and reused by scripts (the credits CLI uses `CreditService` directly).

### 9.4 Bounded contexts

- **Idea:** group the domain into areas with clear edges: Identity, Audit, Credits, Agents.
- **Where:** sections of `schema.prisma`, service folders, `docs/decisions.md`.
- **Why:** keeps the model understandable and makes it obvious what may depend on what (for example, agents code never writes to credit tables directly; it calls `CreditService`).

### 9.5 Facade (and a service boundary)

- **Idea:** the api is the only public door to the AI. The browser never talks to the agents service.
- **Where:** `routes/v1/agents.ts` + `services/agents/agents-client.ts`.
- **Why:** money, auth and persistence stay in one place; the model runtime can be replaced.

### 9.6 Adapter

- **Idea:** one interface, several implementations chosen by config.
- **Where:** email (`smtp` vs `ses`), storage (`minio` vs `s3`), model (`mock` vs `openrouter`).
- **Why:** local and cloud run the **same code path**; only configuration differs.

### 9.7 Strategy (the mock model)

- **Idea:** behavior picked at runtime.
- **Where:** `apps/agents/src/mastra/models.ts` (`resolveModel`).
- **Why:** CI and demos run with no API key, while still exercising the real agent, streaming and billing code.

### 9.8 Single error model with an error envelope

- **Idea:** services throw `AppError(code)`; one handler turns every error into `{ success: false, error, message, details? }`.
- **Where:** `shared-utils/src/errors`, `middleware/error-handler.ts`, `web/src/lib/error-messages.ts`.
- **Why:** clients can rely on a stable machine-readable code; stack traces and internal context stay in logs.

### 9.9 Fail fast on configuration

- **Idea:** validate every environment variable with Zod at startup and refuse to boot if something is wrong.
- **Where:** `apps/api/src/lib/config.ts`, `apps/agents/src/lib/config.ts`.
- **Why:** a missing `JWT_SECRET` should crash at deploy time, not at the first login. This is the "config in the environment" rule from the Twelve-Factor App.

### 9.10 Idempotency keys

- **Idea:** every write that could be retried carries a unique key; a retry returns the original result instead of doing the work again.
- **Where:** `CreditService.withIdempotency` (UNIQUE `idempotency_key`), `signup-bonus:<userId>`, `payment:<id>`, `ask-ai:turn:<turnId>`, event `dedupeKey`s like `turn:<id>:assistant`.
- **Why:** networks fail and webhooks repeat. With keys, "at least once" delivery becomes "exactly once" effect.

### 9.11 Pessimistic locking

- **Idea:** lock the user's row before touching their ledger, so two debits for the same user run one after the other.
- **Where:** `CreditService.lockUser` (`SELECT ... FOR UPDATE`).
- **Why:** simpler and safer than optimistic retries on a computed balance. Locks are per user, so users never wait on each other. Proven by the integration test (10 concurrent debits, balance 5, exactly 5 succeed).

### 9.12 Ledger (double-entry style)

- **Idea:** never store "the balance" as one number you overwrite. Store grants (sources) and immutable transactions, and derive the balance.
- **Where:** `credit_sources` (each grant with its own remaining amount and expiry), `credit_transactions` (with `balance_before`/`balance_after`), `credit_transaction_sources` (which grant paid for what).
- **Why:** full audit trail, expiring credits, "spend the soonest-expiring credits first", and you can always explain a balance.

### 9.13 Append-only event log (event sourcing, light)

- **Idea:** the chat is a list of events with an increasing cursor. The UI is a projection of those events.
- **Where:** `ask_ai_thread_events`, `event-store.ts`, `thread-reducer.ts`.
- **Why:** reconnecting is trivial ("give me everything after cursor N"), nothing is lost, and every client ends in the same state.

### 9.14 Durable events + ephemeral deltas

- **Idea:** persist meaningful events (messages, turn started/failed/cancelled, title); send individual text chunks live only.
- **Where:** `turn-runner.ts` (`hub.publish` for deltas, `emit` for events), decision 005.
- **Why:** persisting every token would multiply database writes about a hundred times.

### 9.15 Publish/subscribe fan-out

- **Idea:** the server running a turn publishes to a channel; whichever server holds the browser's stream subscribes.
- **Where:** `stream-hub.ts` (one shared SUBSCRIBE connection multiplexed across listeners).
- **Why:** horizontal scaling without sticky sessions.

### 9.16 Subscribe-then-drain

- **Idea:** when a browser connects, first subscribe to live messages (buffering them), then read the stored log, then flush the buffer, skipping anything already sent.
- **Where:** `sse-stream.ts`.
- **Why:** no gap between "what was stored" and "what arrives live", and no duplicates.

### 9.17 Pure reducer projection on the client

- **Idea:** UI state = `reduce(events + frames)`, with no side effects, safe to apply twice.
- **Where:** `thread-reducer.ts` and its tests.
- **Why:** predictable, unit-testable, immune to replays and out-of-order frames.

### 9.18 Conditional updates as locks

- **Idea:** `UPDATE ... WHERE activeTurnId IS NULL` either claims the thread or affects 0 rows.
- **Where:** `TurnRunner.start`, `release`, `sweepStaleTurns`, title update (`WHERE title = 'New chat'`), payment status flip.
- **Why:** race-free without explicit locks; the database decides the winner.

### 9.19 Cache-aside with fallback

- **Idea:** read cache first, fall back to the database, re-warm the cache.
- **Where:** `SessionService.validate`, `CacheService.getOrSet`.
- **Why:** speed on the hot path; correctness still comes from MySQL.

### 9.20 Fail open vs fail closed

- **Idea:** decide per feature what an outage should do.
- **Where:** rate limiter **fails open** (Valkey down → allow the request, log a warning); audit writes fail open; session validation falls back to MySQL; the internal token check **fails closed**.
- **Why:** a limiter outage should not take sign-in down; a missing token must never grant access.

### 9.21 Keyset (cursor) pagination

- **Idea:** "give me items older than (timestamp, id)" instead of `OFFSET`.
- **Where:** `thread-directory.ts`, `credit.service.ts` `listTransactions`.
- **Why:** stable when new rows arrive, fast on large tables.

### 9.22 Graceful shutdown and self-healing

- **Idea:** on shutdown, finish or cleanly fail in-flight work; after a crash, a sweep fixes leftovers.
- **Where:** `index.ts` shutdown handler, `TurnRunner.shutdown`, `sweepStaleTurns`.
- **Why:** deploys and crashes never leave a thread stuck "running".

### 9.23 Singleton (per process)

- **Idea:** one Prisma client, one Postgres store, one pair of Valkey connections per process.
- **Where:** `shared-prisma/src/client.ts`, `agents/src/mastra/storage.ts`.
- **Why:** connection pools are expensive; hot reload must not leak them.

---

## 10. Key flows, step by step

### 10.1 Sign up and verify email

1. Web `sign-up` page → `POST /v1/auth/register` `{ name, email, password }`.
2. api: rate limit per IP (10/hour). If a **verified** account already has this email → `409 email_already_exists`. If a **pending** one exists, its details are replaced (whoever proves the inbox sets the password).
3. Password hashed with bcrypt (cost 12; refuses input over 72 bytes, bcrypt's hidden limit). User saved as `pending`.
4. `OtpService.send('verify-email')`: random 6-digit code, only its SHA-256 hash (salted with the email) stored in Valkey for 10 minutes, 30 s resend cooldown, email sent via Mailpit.
5. You open http://localhost:8025, read the code, type it on `verify-email`.
6. `POST /v1/auth/verify-email` → code checked (max 5 guesses, counted atomically), consumed, user becomes `active`, **50 bonus credits** granted (idempotency key `signup-bonus:<id>`, expires in 30 days), welcome email sent, session issued.

### 10.2 Signing in and staying signed in

1. `POST /v1/auth/login` → rate limits (20 per IP and 10 per email per 15 min). bcrypt runs even when the email does not exist (compared against a dummy hash), so timing does not reveal accounts.
2. `SessionService.create`: a row in `user_sessions` with a random `jti`, cached in Valkey.
3. A JWT is signed with `sub` (user id), `jti`, `email`, issuer, audience, 7-day expiry, and set as an **httpOnly, SameSite=Lax** cookie (`Secure` in production).
4. On every later request, `authenticate` verifies the JWT **and** checks that the `jti` session still exists (Valkey first, MySQL fallback). That is why logout, "sign out everywhere", password change and session revoke work **immediately**, even though JWTs normally cannot be revoked.
5. A dead cookie (expired, revoked, forged) is cleared on the response.

### 10.3 A chat turn

```
web                          api (any server)                                agents
 │ POST /v1/agents/ask-ai/threads {content}
 │ ───────────────────────► 1. rate limit (30/min/user), balance ≥ 1 credit?
 │                          2. create thread + conversation (MySQL)
 │                          3. claim: UPDATE conversation SET activeTurnId WHERE NULL
 │                          4. append message.user, turn.started (cursor 1, 2)
 │ ◄── 201 {threadId,turnId}
 │                          5. background ─► POST /internal/.../turn/stream ─► agent.stream()
 │ GET .../events?cursor=0 (SSE)                ◄── NDJSON text-delta … finish{usage}
 │ ◄── message.user, turn.started (from log)
 │ ◄── message.delta … (live via Valkey pub/sub, snapshot every 250 ms)
 │                          6. debit credits from real token usage (key = turn id)
 │                          7. append message.assistant, release claim, status idle
 │ ◄── message.assistant (id = cursor)
 │                          8. ask agents for a title → append thread.title
 │ ◄── thread.title
```

**Failure paths**, all handled in one `finally` block in `turn-runner.ts`:

| Case                                  | Result                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| User presses Stop                     | Cancel signal over pub/sub reaches the server running the turn; the partial answer is kept and billed as an estimate; `turn.cancelled`. |
| Timeout (3 min default)               | `turn.failed` with `turn_timeout`.                                                                                                      |
| Model error                           | `turn.failed` with the error code.                                                                                                      |
| Server shutting down                  | `turn.failed` with `turn_interrupted`.                                                                                                  |
| Server crashed                        | Next sweep (every 60 s on every server) fails and unlocks turns stuck longer than timeout + 1 min.                                      |
| Second message while one is streaming | `409 thread_busy`.                                                                                                                      |
| Browser disconnects                   | Reconnects with the last cursor; gets exactly what it missed plus a snapshot of the in-progress answer.                                 |

**Pricing** (`pricing.ts`): `input_tokens/1000 × 0.05 + output_tokens/1000 × 0.2`, minimum 0.1 credits per turn, rounded **up** to 6 decimals. If the user runs out mid-answer, the delivered tokens are billed up to the balance and the shortfall is recorded (you cannot "un-send" tokens). New turns need at least 1 credit.

### 10.4 Buying credits

1. Billing page → `POST /v1/credits/checkout {packageId}`.
2. api creates a Stripe Checkout Session (price from **our** database, never from the browser) and a `payments` row (`pending`), returns the Stripe URL.
3. User pays on Stripe's page and returns to `/account/billing?checkout=success` (that URL grants nothing).
4. Stripe calls `POST /v1/webhooks/stripe`. api verifies the signature on the raw body, finds the payment by session id, grants credits with key `payment:<id>`, flips the status with a conditional update, audits, emails a receipt. Repeated webhooks are no-ops.

### 10.5 Uploading an avatar

1. `POST /v1/users/me/avatar` (multipart). Limits: 10 uploads/min/user, 3 MB body, 2 MB file.
2. The **first bytes** are checked (PNG/JPEG/WebP "magic numbers"); the declared content type is ignored because the client controls it. A renamed SVG gets `415`.
3. Stored under a fresh random key `avatars/<userId>/<uuid>.<ext>`, then the user row is pointed at it, then the old file is deleted. A failed upload never leaves a broken pointer.
4. Responses include a 1-hour presigned URL.

---

## 11. Security model

| Area              | What protects it                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords         | bcrypt cost 12, 72-byte limit enforced, never logged.                                                                                                                        |
| Sessions          | JWT (HS256 + issuer + audience) **plus** a server-side session row; revocation is immediate.                                                                                 |
| Cookie            | httpOnly (scripts cannot read it), SameSite=Lax, Secure in production, optional parent domain for subdomains.                                                                |
| CSRF              | Credentialed CORS only from `CORS_ORIGINS`; Hono `csrf` rejects cross-site form posts; JSON requests from other sites need a CORS preflight that fails.                      |
| One-time codes    | Stored hashed, 10-minute expiry, consumed on use, 5 guesses per code counted with an atomic `INCR` (parallel guesses cannot exceed it), 30 s resend cooldown, per-IP limits. |
| Account discovery | `otp/send` answers the same for unknown emails; login is timing-equalized. Register deliberately returns 409 for verified accounts (clear UX, rate limited).                 |
| Pre-hijacking     | Activating a pending account via Google or a sign-in code **drops** any password set before the inbox was proven.                                                            |
| Rate limits       | Sliding window in Valkey (atomic Lua script).                                                                                                                                |
| Client IP         | `X-Forwarded-For` ignored unless `TRUST_PROXY_HOPS` is set; then only entries written by our own proxies are used.                                                           |
| Internal service  | Every agents route except `/health/live` (Mastra's built-in `/api/*` included) needs the shared token, compared in constant time. Port bound to localhost in compose.        |
| Uploads           | Size limits at two levels, magic-number type detection, private bucket, expiring signed URLs.                                                                                |
| Model output      | Markdown without raw HTML; dangerous URL schemes removed; links open with `noopener noreferrer`.                                                                             |
| Payments          | Credits only from signature-verified webhooks, idempotent per payment.                                                                                                       |
| Headers           | `secureHeaders` on the api; nosniff, frame deny, referrer and permissions policy on the web.                                                                                 |
| Logs              | Request ids, anonymized IPs (last octet dropped), no secrets.                                                                                                                |
| Audit             | Logins (success and failure), logout, password changes/resets, profile edits, uploads, purchases.                                                                            |
| Containers        | Non-root users, minimal runtime images, `tini`, `.dockerignore` excludes `.env`.                                                                                             |
| SQL               | Prisma parameterizes everything, including the raw row-lock query.                                                                                                           |

---

## 12. Configuration and environment variables

All settings are documented in `.env.example`. The api and agents validate them at startup.

| Group            | Variables                                                                                                                                                                                                            | Notes                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| App              | `NODE_ENV`, `LOG_LEVEL`, `APP_NAME`, `WEB_APP_URL`, `API_PUBLIC_URL`, `CORS_ORIGINS`, `SUPPORT_EMAIL`, `TRUST_PROXY_HOPS`                                                                                            | `CORS_ORIGINS` is required in production. Set `TRUST_PROXY_HOPS=1` behind one load balancer.                                    |
| Data             | `DATABASE_URL`, `REDIS_URL`, `TEST_DATABASE_URL`                                                                                                                                                                     | Pool size via `?connection_limit=10`.                                                                                           |
| Auth             | `JWT_SECRET` (≥ 32 chars), `SESSION_TTL_DAYS`, `AUTH_COOKIE_NAME`, `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_INSECURE`, `GOOGLE_CLIENT_ID`                                                                                  | Generate secrets with `openssl rand -base64 48`. `AUTH_COOKIE_INSECURE` exists only for the local Docker stack over plain HTTP. |
| Email            | `EMAIL_TRANSPORT`, `SMTP_*`, `EMAIL_FROM`, `AWS_REGION`                                                                                                                                                              |                                                                                                                                 |
| Storage          | `STORAGE_PROVIDER`, `STORAGE_ENDPOINT`, `STORAGE_PUBLIC_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`                                                                            | For S3, leave keys empty to use an IAM role.                                                                                    |
| Payments         | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                                                                                                                                         | Both needed to enable checkout.                                                                                                 |
| Credits          | `CREDITS_SIGNUP_BONUS`, `CREDITS_SIGNUP_BONUS_VALIDITY_DAYS`, `ASK_AI_MIN_BALANCE`, `ASK_AI_CREDITS_PER_1K_INPUT_TOKENS`, `ASK_AI_CREDITS_PER_1K_OUTPUT_TOKENS`, `ASK_AI_MIN_TURN_CREDITS`, `ASK_AI_TURN_TIMEOUT_MS` |                                                                                                                                 |
| api ↔ agents     | `AGENTS_BASE_URL`, `API_TO_AGENTS_INTERNAL_TOKEN` (≥ 32 chars)                                                                                                                                                       | Same token on both sides.                                                                                                       |
| Agents           | `AGENTS_STORAGE_DATABASE_URL`, `AGENTS_STORAGE_SCHEMA`, `AGENTS_MODEL_PROVIDER`, `AGENTS_CHAT_MODEL`, `AGENTS_TITLE_MODEL`, `OPENROUTER_API_KEY`                                                                     |                                                                                                                                 |
| Web (build time) | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SIGNUP_BONUS_CREDITS`                                                                                                                                    | `NEXT_PUBLIC_*` values are baked into the JavaScript at build time, so they are Docker **build args**. Never put secrets there. |

Where settings come from:

- `make up`: docker-compose defaults, overridden by a root `.env` if present.
- `make dev`: the api reads the root `.env` with dotenv; agents via `mastra dev --env ../../.env`; the Makefile exports it for Prisma and scripts.

---

## 13. Testing strategy

| Layer               | Where                                                                                                                                                   | Runs with                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Pure logic          | pricing, reducer, schemas, error codes, email templates, database URL, logger, cache, storage config                                                    | `make test` (no services needed)             |
| Services with fakes | OTP (including a parallel brute-force test), users, agents client                                                                                       | `make test`                                  |
| HTTP stack          | `app.test.ts`: health, request id, headers, 404 envelope, auth, validation, CSRF, OpenAPI coverage                                                      | `make test` (no port opened)                 |
| Agents              | config rules, token guard, title cleanup, stream helpers, mock model through a real Mastra agent                                                        | `make test`                                  |
| Ledger integration  | real MySQL: row locks and unique-key races                                                                                                              | `make test-integration` (needs `make infra`) |
| End to end          | real Docker stack: register → verify → login → sessions → avatar → credits → chat stream → follow-up → busy guard → title → ledger → isolation → logout | `make e2e` (needs `make up`)                 |

Gaps worth knowing: there are no unit tests yet for `auth.service`, `session.service` or the Stripe webhook, and no browser (Playwright) tests. The e2e script covers the main auth path end to end.

---

## 14. Command cheat sheet

| I want to...                           | Command                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| See every command                      | `make help`                                                                                   |
| Run everything in Docker               | `make up`, then open http://localhost:3000                                                    |
| Stop (keep data) / wipe data           | `make down` / `make reset`                                                                    |
| Rebuild after code changes             | `make rebuild` (or `make rebuild s=api`)                                                      |
| Tail logs                              | `make logs` (or `make logs s=agents`)                                                         |
| Shell into a container                 | `make shell s=api`                                                                            |
| First-time host setup                  | `make setup`                                                                                  |
| Hot-reload development                 | `make dev` (api :8000, agents :8111, web :3000)                                               |
| Only the databases etc.                | `make infra`                                                                                  |
| New migration after editing the schema | `make db-migrate-new name=add_something`                                                      |
| Browse the database                    | `make db-studio`                                                                              |
| Give a user credits                    | `make credits EMAIL=you@example.com AMOUNT=100`                                               |
| Lint / types / tests / build           | `make lint`, `make type-check`, `make test`, `make build`, or all: `make check`               |
| Check formatting                       | `yarn format:check` (fix with `make format`)                                                  |
| Ledger tests on real MySQL             | `make infra && make test-integration`                                                         |
| Full-stack smoke test                  | `make up && make e2e`                                                                         |
| Export the OpenAPI file                | `make openapi`                                                                                |
| Use a real model                       | put `AGENTS_MODEL_PROVIDER=openrouter` and `OPENROUTER_API_KEY=...` in `.env`, then `make up` |

---

## 15. Guided tour: explore it by hand, start to finish

Follow the steps in order. Each step says **what to do**, **what to look at**, and **which files explain it**. Plan about two to three hours.

### Stage 1: Run it and use it like a user (20 min)

1. `make up`. Watch the order containers become healthy: data services first, then `migrate` exits, then `agents`, `api`, `web`.
   Files: `docker-compose.yml`, `Makefile`.
2. `make ps` and `make logs s=api`. Notice the JSON log lines with `requestId`.
3. Open http://localhost:3000. You are redirected to `/en/auth/sign-in`.
   Files: `apps/web/src/proxy.ts`, `apps/web/src/i18n/routing.ts`.
4. Sign up. Open **Mailpit** at http://localhost:8025 and copy the code. Enter it.
   Files: `apps/api/src/services/auth.service.ts` (`register`, `verifyEmail`), `otp.service.ts`, `packages/shared-utils/src/email-templates/`.
5. You land on `/en/chat` with 50 credits. Ask something. Watch the answer stream in. Press Stop on a second question.
6. Rename, favorite and delete threads in the sidebar. Search.
7. Visit **Account**: change name, upload an avatar, see sessions, sign out another session. Visit **Billing**: balance, packages (checkout disabled without Stripe keys), transaction history.
8. Switch the language to Spanish from the user menu and toggle dark mode.

### Stage 2: Look at the API from outside (20 min)

1. Open http://localhost:8000/doc (Swagger UI). Every endpoint, schema and error response is listed.
   Files: `apps/api/src/routes/v1/*.ts`, `packages/shared-schemas/src/*.ts`.
2. Try `GET /health`, `/health/ready`, `/health/live` in the browser.
   File: `apps/api/src/routes/health.ts`.
3. Watch a live stream in your terminal. In the browser dev tools (Network tab), open a chat and find the `events?cursor=…` request of type `eventsource`; you will see `message.delta` frames, `heartbeat` every 15 s, and durable events with an `id`.
   Files: `services/agents/ask-ai/sse-stream.ts`, `apps/web/src/app/[locale]/(app)/chat/_hooks/use-thread-stream.ts`.
4. Run the automated version of all of the above: `make e2e`. Read `scripts/e2e-smoke.mjs` side by side; it is the best short summary of the whole product.

### Stage 3: Look inside the data stores (30 min)

1. **MySQL:** `make db-studio` (needs a root `.env`: `cp .env.example .env`) or
   `docker compose exec mysql mysql -uboilerplate -pboilerplate boilerplate`, then:
   ```sql
   SELECT id, email, status, email_verified_at FROM users;
   SELECT type, amount, balance_before, balance_after, idempotency_key FROM credit_transactions ORDER BY id;
   SELECT source_type, total_allocated, remaining, expires_at FROM credit_sources;
   SELECT event_cursor, type, dedupe_key FROM ask_ai_thread_events ORDER BY conversation_id, event_cursor;
   SELECT action, status, endpoint, created_at FROM audit_logs ORDER BY id DESC LIMIT 20;
   ```
   Match what you see with `packages/shared-prisma/prisma/schema.prisma`.
2. **Valkey:** `docker compose exec valkey valkey-cli`, then `KEYS *` (fine locally, never in production), `TTL <key>`, and `MONITOR` while you send a chat message to see pub/sub and snapshots live. Use the key table in [5.4](#54-valkey-8-redis-compatible-cache-and-messaging).
3. **Postgres (AI memory):** `docker compose exec postgres psql -U agents -d agents`, then `\dt mastra.*`, `SELECT id, "resourceId" FROM mastra.mastra_threads;`. Compare `mastra_threads.id` with `ask_ai_conversations.mastra_thread_id` in MySQL: that is the link between the two worlds.
4. **MinIO:** http://localhost:9001 (`minioadmin` / `minioadmin`), bucket `boilerplate-assets`, folder `avatars/<userId>/`.
5. **Agents lock-down:** `curl -i http://localhost:8111/api/agents` returns `401`. With the header `x-internal-service-token: local-dev-internal-token-change-me-please-32+` it returns `200`.

### Stage 4: Read the code in this order (60–90 min)

Start at the edges and move inward. Each step builds on the previous one.

1. **Root config:** `package.json` → `turbo.json` → `tsconfig.base.json` → `eslint.config.mjs` → `.prettierrc` → `Makefile` → `docker-compose.yml`. Now you know how things build and run.
2. **Contracts:** `packages/shared-schemas/src/index.ts`, then `common.ts`, `auth.ts`, `credits.ts`, `ask-ai.ts`. Now you know every shape that crosses a network.
3. **Data model:** `packages/shared-prisma/prisma/schema.prisma` (read the header comment, then each section).
4. **Errors:** `packages/shared-utils/src/errors/error-codes.ts` and `app-error.ts`.
5. **api bootstrap:** `apps/api/src/lib/config.ts` → `container.ts` → `app.ts` → `index.ts`.
6. **api cross-cutting:** `middleware/auth.ts`, `middleware/error-handler.ts`, `lib/jwt.ts`, `lib/password.ts`, `lib/rate-limiter.ts`, `lib/request.ts`.
7. **Identity:** `routes/v1/auth.ts` → `services/auth.service.ts` → `session.service.ts` → `otp.service.ts` → `google-auth.service.ts`.
8. **Money:** `services/credit.service.ts` (read the class comment's three invariants first) → `services/credit.service.integration.test.ts` → `payment.service.ts` → `routes/v1/webhooks.ts`.
9. **Chat, api side:** `routes/v1/agents.ts` → `services/agents/ask-ai/conversation.service.ts` → `turn-runner.ts` (read the lifecycle comment at the top) → `event-store.ts` → `stream-hub.ts` → `sse-stream.ts` → `pricing.ts` → `agents-client.ts`.
10. **Chat, agents side:** `apps/agents/src/lib/config.ts` → `mastra/index.ts` → `routes/shared.ts` → `routes/ask-ai-turn.ts` → `agents/ask-ai-agent.ts` → `models.ts` → `routes/thread-title.ts` → `tools/current-time.tool.ts`.
11. **Web foundations:** `apps/web/next.config.ts` → `src/proxy.ts` → `src/app/[locale]/layout.tsx` → `components/providers/app-providers.tsx` → `lib/api/client.ts` → `lib/api/endpoints.ts` → `components/app-shell/auth-gate.tsx`.
12. **Web features:** `app/[locale]/auth/*` (forms with react-hook-form + shared Zod) → `app/[locale]/(app)/chat/page.tsx` → `chat/[threadId]/page.tsx` → `_components/conversation-view.tsx` → `_hooks/use-thread-stream.ts` → `_lib/thread-reducer.ts` (+ its test) → `_components/markdown.tsx` → `account/*`.
13. **Operations:** the three `Dockerfile`s → `.github/workflows/ci.yml` → `scripts/e2e-smoke.mjs`.
14. **Decisions:** finish with `docs/architecture.md` and `docs/decisions.md`. They will read as a summary of what you just saw.

### Stage 5: Make a small change end to end (30 min, optional but the best way to learn)

Add a field `bio` to the profile:

1. `schema.prisma`: add `bio String? @db.VarChar(280)` to `User`.
2. `make infra && make db-migrate-new name=add_user_bio` (creates SQL in `prisma/migrations`).
3. `shared-schemas/src/users.ts`: add `bio` to `UserResponseSchema` and `UpdateProfileRequestSchema`.
4. `yarn build:packages`, then `make type-check`: the compiler now points at every place that must change (`user.service.ts` `toResponse`/`updateProfile`, the profile card). That is the monorepo contract paying off.
5. Add the input to `profile-card.tsx` and the label to both `en.json` and `es.json`.
6. `make check`, then `make rebuild && make e2e`.

---

## 16. Review notes: what was fixed and what is still open

A full review was done before sharing this repo. Here is what was found.

### 16.1 Fixed

| #   | Problem                                                                                                                                                                                                                                                                | Why it mattered                                                                                      | Fix                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Mastra's built-in API was open.** `GET /api/memory/threads?resourceId=1` returned any user's conversations, and `POST /api/agents/askAiAgent/generate` ran the model with no token. Only our custom `/internal/*` routes checked the token.                          | Anyone who could reach the agents port could read all AI memory and spend your model budget.         | `requireInternalToken` server middleware in `apps/agents/src/mastra/routes/shared.ts`, wired in `mastra/index.ts`. Verified: 401 without token, 200 with it. |
| 2   | **`minio/minio` no longer exists on Docker Hub** (deleted September 2026).                                                                                                                                                                                             | `make up` on a fresh machine (a reviewer's laptop, CI) would fail to pull the image.                 | Switched to `cgr.dev/chainguard/minio:latest`. Mailpit pinned to `v1.31` instead of `latest`. Fresh stack verified with the e2e test.                        |
| 3   | **Forgeable client IP.** The api trusted the left-most `X-Forwarded-For` value, which the client controls.                                                                                                                                                             | Every per-IP rate limit (login, register, codes) could be bypassed by sending a random header.       | `TRUST_PROXY_HOPS` (default 0 = use the socket address). When set, only entries added by our own proxies are used. Unit tests added.                         |
| 4   | **OTP guess limit could be bypassed in parallel.** The attempt counter was read-modify-write JSON.                                                                                                                                                                     | 100 simultaneous guesses all read "0 attempts", so one code could be guessed many more than 5 times. | Separate counter with atomic `INCR`, checked before comparing. Test fires 20 parallel wrong guesses and proves the code is burned.                           |
| 5   | **Account pre-hijacking.** An attacker could register `victim@…` with their own password (account stays pending). When the victim later signed in with Google or an emailed code, the account activated **with the attacker's password still valid**.                  | Silent account takeover.                                                                             | Activating a pending account through Google or a sign-in code now clears the unverified password. Verified live: attacker's password login returns 401.      |
| 6   | **`make setup` failed on a fresh clone.** It ran migrations before creating `.env`, and the seed before building the shared packages it imports. Also the Prisma CLI and scripts never read the root `.env`, and `mastra dev` looked for `.env` only in `apps/agents`. | The documented "hot reload" path did not work.                                                       | New `setup` order, `WITH_ENV` in the Makefile, `mastra dev --env ../../.env`. Verified `make db-migrate` and `make db-seed`.                                 |
| 7   | **Docs said things the code did not do.** `next.config.ts` said "the CSP allows…" but there was no CSP. README/architecture said register never reveals whether an email exists, but it returns `409`.                                                                 | A careful reviewer reads comments; wrong ones cost trust.                                            | Comments and docs corrected.                                                                                                                                 |
| 8   | **Open image proxy.** `images.remotePatterns` allowed `https://**` although `next/image` is not used.                                                                                                                                                                  | `/_next/image` could be used to fetch and resize any image on the internet through your server.      | Removed.                                                                                                                                                     |
| 9   | **43 files were not Prettier-formatted,** and `format:check` was not in CI.                                                                                                                                                                                            | `yarn format:check` failed out of the box.                                                           | Formatted everything; `format:check` now covers ts/tsx/md/json and runs in CI.                                                                               |

After the fixes: lint, type-check and all unit tests pass (17 turbo tasks), and a brand-new Docker stack (fresh volumes) passes the full e2e smoke test.

### 16.2 Known limitations (good to mention yourself before a reviewer does)

- **No commits yet.** The repo has no git history. Reviewers often look at history to see how you work. Consider several meaningful commits (for example: scaffold, shared packages, api auth, credits, chat, web, docker/ci) rather than one giant commit.
- **No Content-Security-Policy** on the web app yet (needs nonces for Next.js inline scripts).
- **`/health` is public** and includes dependency error messages and latency. Fine for local; in production restrict it or return only status, and point the load balancer at `/health/ready`.
- **Banning a user does not end their sessions** by itself; the session check does not re-read user status. Call `sessions.destroyAll(userId)` when banning.
- **Thread detail returns at most 1000 events**; very long conversations would need paging.
- **Register reveals existing verified accounts** (409) by design; documented.
- **Prisma 5** is pinned; Prisma 6/7 exist. **Chainguard MinIO** only offers `latest` for free.
- **Test gaps:** no unit tests for `auth.service`, `session.service`, the Stripe webhook, or browser end-to-end tests.
- **Secrets:** the compose defaults (`JWT_SECRET`, internal token, `minioadmin`) are for local use only. Production must set real values; the api refuses secrets shorter than 32 characters but cannot know if you reused the example.
- **Your local stack:** the new MinIO image runs as a non-root user and cannot write to the old `boilerplate_minio_data` volume (created by the old image as root). Recreate that one volume (this deletes local avatars only): `docker compose down && docker volume rm boilerplate_minio_data && make up`. Or `make reset` to start completely fresh.

---

## 17. Glossary

| Term                        | Meaning                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| **Monorepo**                | Many packages in one git repository.                                                              |
| **Workspace**               | One package inside the monorepo (`apps/api`, `packages/shared-utils`...).                         |
| **ORM**                     | Library that maps database tables to code objects (Prisma).                                       |
| **Migration**               | A versioned SQL file that changes the database schema.                                            |
| **JWT**                     | JSON Web Token: a signed string that says who you are. Here it also carries a session id (`jti`). |
| **httpOnly cookie**         | A cookie JavaScript cannot read, so injected scripts cannot steal it.                             |
| **SameSite=Lax**            | The browser does not send the cookie on cross-site POSTs (CSRF protection).                       |
| **CORS**                    | Browser rule deciding which other websites may call your API.                                     |
| **CSRF**                    | Tricking a signed-in browser into sending an unwanted request.                                    |
| **OTP**                     | One-time password: the 6-digit emailed code.                                                      |
| **Rate limit**              | Maximum number of requests in a time window.                                                      |
| **Idempotent**              | Doing it twice has the same effect as doing it once.                                              |
| **Idempotency key**         | A unique id sent with a request so retries are recognized.                                        |
| **Row lock (`FOR UPDATE`)** | Makes other transactions wait before changing the same row.                                       |
| **Ledger**                  | An append-only record of money movements.                                                         |
| **Event log / cursor**      | An ordered list of events; the cursor is the position number.                                     |
| **SSE**                     | Server-Sent Events: a one-way stream from server to browser over plain HTTP.                      |
| **NDJSON**                  | Newline-delimited JSON: one JSON object per line, easy to stream.                                 |
| **Pub/sub**                 | Publish/subscribe: senders publish to a channel, every subscriber receives it.                    |
| **Presigned URL**           | A temporary link to a private file, signed by the server.                                         |
| **Magic number**            | The first bytes of a file that identify its real type.                                            |
| **Token (AI)**              | A chunk of text (about 4 characters) models are billed by.                                        |
| **Working memory**          | A small note the AI keeps about a user across conversations.                                      |
| **Liveness / readiness**    | "Is the process alive?" vs "can it serve traffic right now?".                                     |
| **Graceful shutdown**       | Finishing or cleanly failing work before the process exits.                                       |
| **Composition root**        | The single place where all objects are created and connected.                                     |
| **Bounded context**         | A part of the domain with its own clear model and boundary.                                       |
| **Keyset pagination**       | Paging by "after this key" instead of "skip N rows".                                              |
| **Multi-stage build**       | A Dockerfile with several stages; only the last one ships.                                        |
| **tini**                    | A tiny init process that forwards signals in containers.                                          |
