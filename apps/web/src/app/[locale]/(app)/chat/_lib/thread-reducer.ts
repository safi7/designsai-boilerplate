import type { StreamFrame, ThreadEvent, TurnUsage } from '@boilerplate/shared-schemas';

export interface ChatMessage {
  id: string;
  turnId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'cancelled' | 'failed';
  usage?: TurnUsage | null;
  errorCode?: string;
}

export interface StreamingTurn {
  turnId: string;
  content: string;
  /** Highest delta sequence applied; older/duplicate frames are ignored. */
  seq: number;
}

export interface ThreadState {
  title: string;
  messages: ChatMessage[];
  streaming: StreamingTurn | null;
  /** Highest durable event cursor applied — the resume point for SSE. */
  cursor: number;
}

export type ThreadAction =
  | { type: 'hydrate'; title: string; events: ThreadEvent[]; activeTurnId: string | null }
  | { type: 'event'; event: ThreadEvent }
  | { type: 'frame'; frame: StreamFrame };

export const initialThreadState: ThreadState = { title: '', messages: [], streaming: null, cursor: 0 };

function upsert(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return messages.some(m => m.id === message.id) ? messages.map(m => (m.id === message.id ? message : m)) : [...messages, message];
}

function applyEvent(state: ThreadState, event: ThreadEvent): ThreadState {
  // Durable events are idempotent by cursor: replays after a reconnect are no-ops.
  if (event.cursor <= state.cursor) return state;
  const next = { ...state, cursor: event.cursor };
  const endsStreaming = (turnId: string) => (state.streaming?.turnId === turnId ? null : state.streaming);

  switch (event.type) {
    case 'message.user':
      return {
        ...next,
        messages: upsert(state.messages, {
          id: event.payload.messageId,
          turnId: event.payload.turnId,
          role: 'user',
          content: event.payload.content,
          status: 'complete',
        }),
      };
    case 'turn.started':
      return {
        ...next,
        streaming: state.streaming?.turnId === event.payload.turnId ? state.streaming : { turnId: event.payload.turnId, content: '', seq: 0 },
      };
    case 'message.assistant':
      return {
        ...next,
        streaming: endsStreaming(event.payload.turnId),
        messages: upsert(state.messages, {
          id: event.payload.messageId,
          turnId: event.payload.turnId,
          role: 'assistant',
          content: event.payload.content,
          status: 'complete',
          usage: event.payload.usage,
        }),
      };
    case 'turn.cancelled':
      return {
        ...next,
        streaming: endsStreaming(event.payload.turnId),
        messages: upsert(state.messages, {
          id: `${event.payload.turnId}:assistant`,
          turnId: event.payload.turnId,
          role: 'assistant',
          content: event.payload.partialContent,
          status: 'cancelled',
        }),
      };
    case 'turn.failed':
      return {
        ...next,
        streaming: endsStreaming(event.payload.turnId),
        messages: upsert(state.messages, {
          id: `${event.payload.turnId}:assistant`,
          turnId: event.payload.turnId,
          role: 'assistant',
          content: event.payload.message,
          status: 'failed',
          errorCode: event.payload.code,
        }),
      };
    case 'thread.title':
      return { ...next, title: event.payload.title };
    default:
      return next;
  }
}

function applyFrame(state: ThreadState, frame: StreamFrame): ThreadState {
  // A frame for a turn that has already settled (late delivery) is dropped.
  if (state.messages.some(m => m.turnId === frame.turnId && m.role === 'assistant')) return state;
  const current = state.streaming?.turnId === frame.turnId ? state.streaming : { turnId: frame.turnId, content: '', seq: 0 };

  if (frame.type === 'message.snapshot') {
    if (frame.seq < current.seq) return state;
    return { ...state, streaming: { turnId: frame.turnId, content: frame.content, seq: frame.seq } };
  }
  if (frame.seq <= current.seq) return state;
  return { ...state, streaming: { ...current, content: current.content + frame.delta, seq: frame.seq } };
}

/**
 * Pure projection of the thread's event log (+ live frames) into UI state.
 * Every input is idempotent, so reconnects, duplicate deliveries and the
 * initial REST snapshot overlapping the SSE stream all converge.
 */
export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case 'hydrate': {
      let next: ThreadState = { ...initialThreadState, title: action.title };
      for (const event of action.events) next = applyEvent(next, event);
      if (action.activeTurnId && !next.streaming) next = { ...next, streaming: { turnId: action.activeTurnId, content: '', seq: 0 } };
      if (!action.activeTurnId) next = { ...next, streaming: null };
      return next;
    }
    case 'event':
      return applyEvent(state, action.event);
    case 'frame':
      return applyFrame(state, action.frame);
    default:
      return state;
  }
}
