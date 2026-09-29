'use client';

import { StreamFrameSchema, ThreadEventSchema, type StreamFrame, type ThreadEvent } from '@boilerplate/shared-schemas';
import { useEffect, useRef, useState } from 'react';
import { threadsApi } from '@/lib/api/endpoints';

const DURABLE_EVENTS = ['message.user', 'message.assistant', 'turn.started', 'turn.failed', 'turn.cancelled', 'thread.title'] as const;
const LIVE_FRAMES = ['message.delta', 'message.snapshot'] as const;
/** The API sends a heartbeat every 15 s; silence for longer means a dead connection. */
const STALL_MS = 45_000;
const MAX_BACKOFF_MS = 15_000;

export type StreamStatus = 'connecting' | 'open' | 'reconnecting';

interface Options {
  threadId: string | null;
  /** Read at (re)connect time so a reconnect resumes from the latest applied cursor. */
  getCursor: () => number;
  onEvent: (event: ThreadEvent) => void;
  onFrame: (frame: StreamFrame) => void;
}

/**
 * Owns the EventSource for one thread: named-event routing, schema validation
 * of every frame, a heartbeat watchdog and exponential-backoff reconnects.
 * Callbacks live in refs so re-renders never tear the connection down.
 */
export function useThreadStream({ threadId, getCursor, onEvent, onFrame }: Options) {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const handlers = useRef({ getCursor, onEvent, onFrame });
  useEffect(() => {
    handlers.current = { getCursor, onEvent, onFrame };
  });

  useEffect(() => {
    if (!threadId) return;
    let source: EventSource | null = null;
    let attempt = 0;
    let lastActivity = Date.now();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(threadsApi.eventsUrl(threadId, handlers.current.getCursor()), { withCredentials: true });
      lastActivity = Date.now();

      source.onopen = () => {
        attempt = 0;
        lastActivity = Date.now();
        setStatus('open');
      };
      source.onerror = () => {
        // Always take over reconnection: we reopen with an explicit cursor
        // instead of relying on the browser's retry policy.
        scheduleReconnect();
      };
      for (const type of DURABLE_EVENTS) {
        source.addEventListener(type, message => {
          lastActivity = Date.now();
          const parsed = ThreadEventSchema.safeParse(JSON.parse((message as MessageEvent<string>).data));
          if (parsed.success) handlers.current.onEvent(parsed.data);
        });
      }
      for (const type of LIVE_FRAMES) {
        source.addEventListener(type, message => {
          lastActivity = Date.now();
          const parsed = StreamFrameSchema.safeParse(JSON.parse((message as MessageEvent<string>).data));
          if (parsed.success) handlers.current.onFrame(parsed.data);
        });
      }
      source.addEventListener('heartbeat', () => {
        lastActivity = Date.now();
      });
    };

    const scheduleReconnect = () => {
      source?.close();
      source = null;
      if (disposed || reconnectTimer) return;
      setStatus('reconnecting');
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt) + Math.random() * 250;
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const watchdog = setInterval(() => {
      if (source && Date.now() - lastActivity > STALL_MS) scheduleReconnect();
    }, 10_000);

    connect();
    return () => {
      disposed = true;
      clearInterval(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [threadId]);

  return { status };
}
