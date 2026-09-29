# Architecture

## Services and boundaries

| Service  | Owns                                                            | Never touches         |
| -------- | --------------------------------------------------------------- | --------------------- |
| `web`    | UI, routing, optimistic auth redirects                          | secrets, the database |
| `api`    | users, sessions, credits, payments, threads, the event log, SSE | model SDKs            |
| `agents` | model execution, conversation memory (Postgres)                 | users, credits, MySQL |

The `agents` service is internal only. Every `/internal/*` call carries `x-internal-service-token`, which the service checks with a constant-time comparison. Because credits and persistence stay in the API, the model runtime can be swapped or scaled without touching money.

Inside the API, `container.ts` is the only composition root. Services receive their collaborators through constructors, so unit tests pass in plain fakes (`src/test/fakes.ts`), and `app.ts` builds the full HTTP stack without opening a port. Routes stay thin: they parse input, call a service, and shape the response.

## Contracts

`packages/shared-schemas` holds the Zod schemas that:

- the API validates requests against and publishes as OpenAPI 3.1 (`/doc/openapi.json`)
- the web app imports as TypeScript types (`src/lib/api/endpoints.ts`)
- the API and agents services use to validate each other's NDJSON frames

A contract change is therefore a compile error on the other side, not a runtime surprise.

Errors always use the envelope `{ success: false, error: <stable code>, message, details? }`. Codes live in `shared-utils/errors` and are localized in the web app under `errors.<code>`.

## Chat turn lifecycle

```
web                          api (any replica)                               agents
 │ POST /v1/agents/ask-ai/threads
 │ ────────────────────────► claim turn (conditional UPDATE activeTurnId)
 │                           append message.user, turn.started  (MySQL)
 │ ◄─ 201 {threadId,turnId}  ── background ─► POST /internal/.../turn/stream ─► agent.stream()
 │ GET …/events?cursor=N (SSE)                ◄── NDJSON text-delta … finish{usage}
 │ ◄─ message.delta (live, Redis pub/sub)
 │                           debit credits (idempotency key = turn id)
 │                           append message.assistant, release claim
 │ ◄─ message.assistant (id = cursor)
 │                           generate title → append thread.title
```

**Durable events** (`message.*`, `turn.*`, `thread.title`) are appended to `ask_ai_thread_events` with a gap-free cursor. The cursor is incremented under the conversation's row lock, and a `dedupeKey` makes every append idempotent. Each SSE frame's `id` is its cursor, so a reconnect resumes exactly where it left off.

**Live frames** (`message.delta`) are never persisted. A throttled Redis snapshot of the in-progress text lets a client that connects mid-answer catch up.

**Subscribe-then-drain.** The SSE handler subscribes before it reads the log, buffers live messages until the drain finishes, then drops anything already sent. The result has no gaps and no duplicates.

**Client reducer.** On the web side, `thread-reducer.ts` is a pure, idempotent projection of these inputs, with unit tests covering replays, stale frames and late snapshots.

**Failure modes**, which all settle through one `finally` block:

- Cancel: the Redis signal reaches whichever replica owns the turn, and any partial output is billed as an estimate.
- Timeout.
- Agent error.
- Shutdown: in-flight turns are aborted and fail cleanly.
- Process crash: `sweepStaleTurns` fails and unlocks orphaned turns.

## Credit ledger

- `credit_sources`: grants, each with its own remaining balance and expiry.
- `credit_transactions`: immutable entries recording `balance_before` and `balance_after`. The UNIQUE `idempotency_key` means a retried write returns the original result instead of charging again.
- `credit_transaction_sources`: which sources a transaction drew from, and how much from each.
- `credit_usage_logs`: what a debit paid for (feature, model, token counts).

Every grant and debit runs `SELECT … FROM users WHERE id = ? FOR UPDATE` first, which serializes each user's ledger. The integration test fires 10 concurrent debits at a balance of 5 and asserts that exactly 5 succeed and the balance ends at 0.

Chat turns debit with `allowPartial`: tokens that were already delivered are billed up to the available balance and the shortfall is recorded. New turns are refused below `ASK_AI_MIN_BALANCE`.

## Security model

- **Sessions.** The JWT (HS256, with issuer and audience) carries a `jti` that must still exist in `user_sessions`. Validity is cached in Redis and falls back to MySQL.
- **Cookie.** It is `httpOnly` and `SameSite=Lax`, and `Secure` in production. A dead cookie is cleared on the next request.
- **CSRF.** The API allows credentialed CORS only from `CORS_ORIGINS` and rejects cross-site form posts (Hono `csrf`).
- **OTP.** Codes are stored hashed, allow 5 attempts per code (counted atomically with `INCR`, so parallel guesses cannot exceed it), are consumed on use, and have a resend cooldown.
- **Account discovery.** `otp/send` answers the same way for unknown emails, and login always runs bcrypt so timing does not leak existence. Register is the deliberate exception: it returns `409 email_already_exists` for a verified account, trading a little enumeration resistance for a clear sign-up UX (it is rate limited per IP).
- **Pre-hijacking.** Activating a pending account through Google or an emailed sign-in code drops any password set before the inbox was proven, so someone who registered your email first cannot keep a way in.
- **Client IP.** `X-Forwarded-For` is ignored unless `TRUST_PROXY_HOPS` is set, and then only the entries written by our own proxies are used, so per-IP rate limits cannot be dodged with a forged header.
- **Agents service.** Every route except `/health/live`, including Mastra's built-in `/api/*`, requires the internal token outside `NODE_ENV=development`.
- **Uploads.** Size is limited at both the body and handler level. File type is detected from magic bytes. Files go to a private bucket and are served through presigned URLs.
- **Rendering.** Model output is rendered as Markdown without raw HTML, and `javascript:` URLs are neutralized.
- **Audit.** `audit_logs` records logins, failed logins, password changes, profile edits and purchases.

## Data model

There is one migration, `20260928000000_init`. The schema is grouped into four bounded contexts, in file order: Identity, Audit, Credits and Agents (`packages/shared-prisma/prisma/schema.prisma`). New changes go through `make db-migrate-new name=…`, and CI fails if the schema and migrations drift apart.
