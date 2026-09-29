#!/usr/bin/env node
/**
 * Black-box end-to-end smoke test against a running stack (`make up`).
 * Zero dependencies: Node 22 fetch + Mailpit's HTTP API.
 *
 *   node scripts/e2e-smoke.mjs
 *   API_URL=… MAILPIT_URL=… node scripts/e2e-smoke.mjs
 *
 * Covers: register → email OTP → verify → session cookie → profile/avatar
 * upload (object storage) → credits → Ask AI thread with live SSE streaming →
 * follow-up message → title → credit debit in the ledger → logout.
 */
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:8000';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const email = `e2e-${Date.now()}@example.com`;
let cookie = '';

const step = (name) => console.log(`\n▶ ${name}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function api(path, { method = 'GET', body, form, expect = 200 } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      origin: WEB,
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie?.startsWith('auth_token=')) cookie = setCookie.split(';')[0];
  const json = await res.json().catch(() => null);
  assert.equal(res.status, expect, `${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function latestCode(to, subjectIncludes) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const message = list.messages?.find((m) => m.Subject.includes(subjectIncludes));
    if (message) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json();
      const code = full.Text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email "${subjectIncludes}" for ${to}`);
}

/** Read the SSE stream until the turn settles; returns the events seen. */
async function streamUntilSettled(threadId, fromCursor, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(`${API}/v1/agents/ask-ai/threads/${threadId}/events?cursor=${fromCursor}`, { headers: { cookie }, signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);

  const decoder = new TextDecoder();
  const seen = [];
  let buffer = '';
  try {
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const type = raw.match(/^event: (.+)$/m)?.[1];
        const data = raw.match(/^data: (.+)$/m)?.[1];
        if (!type || !data) continue;
        seen.push({ type, data: JSON.parse(data) });
        if (type === 'message.assistant' || type === 'turn.failed' || type === 'turn.cancelled') {
          controller.abort();
          return seen;
        }
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
  }
  return seen;
}

async function main() {
  step('Health');
  const health = await (await fetch(`${API}/health`)).json();
  assert.equal(health.checks.database.status, 'up');
  assert.equal(health.checks.redis.status, 'up');
  ok(`api ${health.status} (${Object.entries(health.checks).map(([k, v]) => `${k}:${v.status}`).join(', ')})`);

  step('Register + verify email');
  await api('/v1/auth/register', { method: 'POST', body: { name: 'E2E', lastName: 'Runner', email, password: 'correct1horse' }, expect: 201 });
  await api('/v1/auth/login', { method: 'POST', body: { email, password: 'correct1horse' }, expect: 403 });
  ok('login refused before verification (email_not_verified)');
  const code = await latestCode(email, 'Verify');
  ok(`verification code received via Mailpit`);
  const verified = await api('/v1/auth/verify-email', { method: 'POST', body: { email, code } });
  assert.ok(cookie, 'session cookie set');
  assert.equal(verified.user.emailVerified, true);
  ok('verified and signed in (httpOnly cookie)');

  step('Password login + sessions');
  cookie = '';
  await api('/v1/auth/login', { method: 'POST', body: { email, password: 'wrong1horse' }, expect: 401 });
  await api('/v1/auth/login', { method: 'POST', body: { email, password: 'correct1horse' } });
  const me = await api('/v1/auth/me');
  assert.equal(me.email, email);
  const sessions = await api('/v1/auth/sessions');
  assert.ok(sessions.sessions.some((s) => s.current));
  ok(`${sessions.sessions.length} active sessions`);

  step('Profile + avatar upload (object storage)');
  await api('/v1/users/me', { method: 'PATCH', body: { name: 'Edith', language: 'es' } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'avatar.png');
  const withAvatar = await api('/v1/users/me/avatar', { method: 'POST', form });
  assert.ok(withAvatar.avatarUrl);
  const avatar = await fetch(withAvatar.avatarUrl);
  assert.equal(avatar.status, 200);
  ok('avatar stored and served via presigned URL');
  const fake = new FormData();
  fake.append('file', new Blob(['<svg/>'], { type: 'image/png' }), 'x.png');
  await api('/v1/users/me/avatar', { method: 'POST', form: fake, expect: 415 });
  ok('spoofed content type rejected by magic-number check');

  step('Credits');
  const before = await api('/v1/credits/balance');
  assert.equal(Number(before.balance), 50);
  const packages = await api('/v1/credits/packages');
  assert.ok(packages.packages.length >= 1);
  ok(`balance ${before.balance}, ${packages.packages.length} packages, checkout ${packages.checkoutEnabled ? 'on' : 'off'}`);

  step('Ask AI: new thread with streamed answer');
  const created = await api('/v1/agents/ask-ai/threads', { method: 'POST', body: { content: 'Say hello in one short sentence.' }, expect: 201 });
  const events = await streamUntilSettled(created.threadId, 0);
  const deltas = events.filter((e) => e.type === 'message.delta' || e.type === 'message.snapshot');
  const answer = events.find((e) => e.type === 'message.assistant');
  assert.ok(answer, `turn settled: ${events.map((e) => e.type).join(',')}`);
  assert.ok(answer.data.payload.content.length > 0);
  ok(`${deltas.length} live frames, answer: "${answer.data.payload.content.slice(0, 60)}…"`);
  ok(`charged ${answer.data.payload.usage.creditsCharged} credits`);

  step('Ask AI: follow-up + busy guard + title');
  const detail = await api(`/v1/agents/threads/${created.threadId}`);
  await api(`/v1/agents/threads/${created.threadId}/messages`, { method: 'POST', body: { content: 'And now in Spanish?' }, expect: 202 });
  await api(`/v1/agents/threads/${created.threadId}/messages`, { method: 'POST', body: { content: 'too fast' }, expect: 409 });
  ok('concurrent turn rejected (thread_busy)');
  const second = await streamUntilSettled(created.threadId, detail.cursor);
  assert.ok(second.some((e) => e.type === 'message.assistant'));
  const list = await api('/v1/agents/threads');
  const thread = list.items.find((t) => t.id === created.threadId);
  assert.ok(thread && thread.title !== 'New chat', `title generated: ${thread?.title}`);
  ok(`thread titled "${thread.title}"`);

  step('Ledger');
  const after = await api('/v1/credits/balance');
  assert.ok(Number(after.balance) < Number(before.balance));
  const tx = await api('/v1/credits/transactions');
  assert.ok(tx.items.some((t) => t.type === 'usage'));
  assert.ok(tx.items.some((t) => t.type === 'grant'));
  ok(`balance ${before.balance} → ${after.balance}; ${tx.items.length} ledger entries`);

  step('Isolation + logout');
  const other = cookie;
  cookie = '';
  await api(`/v1/agents/threads/${created.threadId}`, { expect: 401 });
  cookie = other;
  await api('/v1/auth/logout', { method: 'POST' });
  cookie = other;
  await api('/v1/auth/me', { expect: 401 });
  ok('revoked session token is rejected immediately');

  console.log('\n✅ End-to-end smoke test passed');
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}`);
  process.exit(1);
});
