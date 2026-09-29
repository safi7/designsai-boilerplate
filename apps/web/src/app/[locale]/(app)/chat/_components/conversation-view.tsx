'use client';

import type { ThreadDetailResponse } from '@boilerplate/shared-schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { StickToBottom } from 'use-stick-to-bottom';
import { ApiError } from '@/lib/api/client';
import { threadsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';
import { useThreadStream } from '../_hooks/use-thread-stream';
import { initialThreadState, threadReducer } from '../_lib/thread-reducer';
import { Composer } from './composer';
import { CreditsNotice } from './credits-notice';
import { AssistantBubble, StreamingBubble, UserBubble } from './message-bubble';

export function ConversationView({ detail }: { detail: ThreadDetailResponse }) {
  const t = useTranslations('chat');
  const tErrors = useTranslations('errors');
  const queryClient = useQueryClient();
  const threadId = detail.thread.id;
  const [outOfCredits, setOutOfCredits] = useState(false);

  const [state, dispatch] = useReducer(threadReducer, detail, d =>
    threadReducer(initialThreadState, { type: 'hydrate', title: d.thread.title, events: d.events, activeTurnId: d.activeTurnId })
  );
  const cursorRef = useRef(state.cursor);
  useEffect(() => {
    cursorRef.current = state.cursor;
  }, [state.cursor]);

  const refreshSidebar = useCallback(() => void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all }), [queryClient]);

  const { status } = useThreadStream({
    threadId,
    getCursor: () => cursorRef.current,
    onFrame: frame => dispatch({ type: 'frame', frame }),
    onEvent: event => {
      dispatch({ type: 'event', event });
      if (event.type === 'message.assistant' || event.type === 'turn.cancelled') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.credits.all });
      }
      if (event.type === 'thread.title' || event.type === 'message.assistant' || event.type === 'turn.failed') refreshSidebar();
    },
  });

  const send = useMutation({
    mutationFn: (content: string) => threadsApi.send(threadId, content),
    onSuccess: () => {
      setOutOfCredits(false);
      refreshSidebar();
    },
    onError: error => {
      if (error instanceof ApiError && error.code === 'insufficient_credits') setOutOfCredits(true);
      else toast.error(errorMessage(error, tErrors));
    },
  });
  const stop = useMutation({ mutationFn: () => threadsApi.cancel(threadId) });

  const busy = state.streaming !== null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <h1 className="truncate text-sm font-medium">{state.title}</h1>
        {status === 'reconnecting' ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <WifiOff className="size-3.5" aria-hidden />…
          </span>
        ) : null}
      </header>

      <StickToBottom className="relative min-h-0 flex-1 overflow-y-auto" resize="smooth" initial="instant">
        <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {state.messages.map(message =>
            message.role === 'user' ? (
              <UserBubble key={message.id} content={message.content} />
            ) : (
              <AssistantBubble key={message.id} message={message} />
            )
          )}
          {state.streaming ? <StreamingBubble content={state.streaming.content} /> : null}
        </StickToBottom.Content>
      </StickToBottom>

      <div className="mx-auto grid w-full max-w-3xl gap-2 px-4 pb-4">
        {outOfCredits ? <CreditsNotice /> : null}
        <Composer onSubmit={content => send.mutateAsync(content)} onStop={() => stop.mutate()} busy={busy} />
        <p className="text-center text-xs text-muted-foreground">{t('disclaimer')}</p>
      </div>
    </div>
  );
}
