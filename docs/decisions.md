# Decision log

Short records of choices that shape the codebase. Newest first.

### 007: Offline mock model is the default

The full stack, CI and the e2e test run without any API key. Setting `AGENTS_MODEL_PROVIDER=openrouter` switches to real models. The mock runs through the real Mastra agent path, so streaming and usage reporting are exercised the same way in both modes.

### 006: SSE over WebSockets for chat

Traffic is one-way (server to client) with occasional client commands, so plain HTTP POSTs are enough for the commands. SSE works through proxies and load balancers without special handling, reconnects natively with `Last-Event-ID`, and authenticates with the same cookie.

### 005: Durable event log + ephemeral deltas

Persisting every token would multiply writes about 100×. Instead, only semantic events are durable. Text deltas travel over Redis pub/sub, and a snapshot covers late subscribers. This makes a thread fully reconstructable from MySQL while keeping streaming cheap.

### 004: Credits and persistence live in the API, not the agent runtime

The agents service is stateless with respect to money. It reports token usage, and the API bills idempotently per turn. This lets the model runtime be replaced or scaled independently.

### 003: Pessimistic row lock per user for the ledger

Optimistic concurrency on a computed balance is easy to get wrong. A `FOR UPDATE` lock on the user row is simple, correct, and cheap at per-user granularity.

### 002: httpOnly cookie sessions backed by a server-side session table

Scripts never see the token, and revocation takes effect immediately. The API also accepts `Authorization: Bearer` for API clients and Swagger UI.

### 001: Monorepo with shared Zod contracts

There is one source of truth for request and response shapes across web, api and agents, and the same schemas generate the OpenAPI document. Turborepo handles build ordering and caching.
