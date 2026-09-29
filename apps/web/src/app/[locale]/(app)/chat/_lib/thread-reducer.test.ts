import type { ThreadEvent } from '@boilerplate/shared-schemas';
import { describe, expect, it } from 'vitest';
import { initialThreadState, threadReducer, type ThreadState } from './thread-reducer';

const at = '2026-01-01T00:00:00.000Z';
const user = (cursor: number, turnId: string, content: string): ThreadEvent => ({
  type: 'message.user',
  cursor,
  createdAt: at,
  payload: { messageId: `${turnId}:user`, turnId, content },
});
const started = (cursor: number, turnId: string): ThreadEvent => ({ type: 'turn.started', cursor, createdAt: at, payload: { turnId } });
const assistant = (cursor: number, turnId: string, content: string): ThreadEvent => ({
  type: 'message.assistant',
  cursor,
  createdAt: at,
  payload: { messageId: `${turnId}:assistant`, turnId, content, usage: { inputTokens: 1, outputTokens: 2, creditsCharged: '0.1' } },
});

const run = (state: ThreadState, ...events: ThreadEvent[]) => events.reduce((s, event) => threadReducer(s, { type: 'event', event }), state);

describe('threadReducer', () => {
  it('streams deltas and settles into a final message', () => {
    let state = run(initialThreadState, user(1, 't1', 'hi'), started(2, 't1'));
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.delta', turnId: 't1', seq: 1, delta: 'Hel' } });
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.delta', turnId: 't1', seq: 2, delta: 'lo' } });
    expect(state.streaming?.content).toBe('Hello');

    state = run(state, assistant(3, 't1', 'Hello'));
    expect(state.streaming).toBeNull();
    expect(state.messages.map(m => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'Hello'],
    ]);
    expect(state.cursor).toBe(3);
  });

  it('ignores replayed events and duplicate or stale frames', () => {
    let state = run(initialThreadState, user(1, 't1', 'hi'), started(2, 't1'), user(1, 't1', 'hi'));
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.delta', turnId: 't1', seq: 1, delta: 'A' } });
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.delta', turnId: 't1', seq: 1, delta: 'A' } });
    expect(state.messages).toHaveLength(1);
    expect(state.streaming?.content).toBe('A');
  });

  it('lets a snapshot catch a late subscriber up, then continues from its seq', () => {
    let state = run(initialThreadState, user(1, 't1', 'hi'), started(2, 't1'));
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.snapshot', turnId: 't1', seq: 5, content: 'Hello wor' } });
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.delta', turnId: 't1', seq: 4, delta: 'xx' } });
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.delta', turnId: 't1', seq: 6, delta: 'ld' } });
    expect(state.streaming?.content).toBe('Hello world');
  });

  it('drops frames that arrive after the turn settled', () => {
    let state = run(initialThreadState, user(1, 't1', 'hi'), started(2, 't1'), assistant(3, 't1', 'done'));
    state = threadReducer(state, { type: 'frame', frame: { type: 'message.delta', turnId: 't1', seq: 9, delta: 'late' } });
    expect(state.streaming).toBeNull();
  });

  it('renders failures and cancellations as assistant messages', () => {
    const state = run(
      initialThreadState,
      user(1, 't1', 'a'),
      { type: 'turn.failed', cursor: 2, createdAt: at, payload: { turnId: 't1', code: 'agent_error', message: 'boom' } },
      user(3, 't2', 'b'),
      { type: 'turn.cancelled', cursor: 4, createdAt: at, payload: { turnId: 't2', partialContent: 'par' } }
    );
    expect(state.messages.map(m => m.status)).toEqual(['complete', 'failed', 'complete', 'cancelled']);
  });

  it('hydrates from the REST snapshot and marks an in-flight turn', () => {
    const state = threadReducer(initialThreadState, {
      type: 'hydrate',
      title: 'Trip',
      events: [user(1, 't1', 'hi'), started(2, 't1')],
      activeTurnId: 't1',
    });
    expect(state.title).toBe('Trip');
    expect(state.streaming?.turnId).toBe('t1');
    expect(state.cursor).toBe(2);
  });
});
