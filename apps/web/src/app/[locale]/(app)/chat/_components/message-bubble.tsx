'use client';

import { AlertCircle, Check, Copy, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '../_lib/thread-reducer';
import { Markdown } from './markdown';

export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap">{content}</div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background" aria-hidden>
      <Sparkles className="size-3.5" />
    </span>
  );
}

export function AssistantBubble({ message }: { message: ChatMessage }) {
  const t = useTranslations('chat');
  const [copied, setCopied] = useState(false);

  if (message.status === 'failed') {
    return (
      <div className="flex gap-3">
        <AssistantAvatar />
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="size-4" aria-hidden />
          {message.content || t('failed')}
        </div>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        {message.content ? <Markdown content={message.content} /> : null}
        {message.status === 'cancelled' ? <p className="mt-2 text-sm text-muted-foreground italic">{t('cancelled')}</p> : null}
        <div
          className={cn(
            'mt-1 flex items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
          )}
        >
          <Button variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label={copied ? t('copied') : t('copy')}>
            {copied ? <Check /> : <Copy />}
          </Button>
          {message.usage ? <span>{t('charged', { credits: message.usage.creditsCharged })}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function StreamingBubble({ content }: { content: string }) {
  const t = useTranslations('chat');
  return (
    <div className="flex gap-3" aria-live="polite" aria-busy="true">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        {content ? (
          <Markdown content={content} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex gap-1" aria-hidden>
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current" />
            </span>
            {t('thinking')}
          </p>
        )}
      </div>
    </div>
  );
}
