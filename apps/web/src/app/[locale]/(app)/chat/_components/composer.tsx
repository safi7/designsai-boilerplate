'use client';

import { ASK_AI_MESSAGE_MAX_LENGTH } from '@boilerplate/shared-schemas';
import { ArrowUp, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ComposerProps {
  onSubmit: (content: string) => Promise<unknown> | void;
  onStop?: () => void;
  busy?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/** Enter sends, Shift+Enter adds a newline; grows with its content up to a cap. */
export function Composer({ onSubmit, onStop, busy = false, disabled = false, autoFocus, className }: ComposerProps) {
  const t = useTranslations('chat');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !busy && !disabled && !submitting;

  const resize = () => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const submit = async () => {
    if (!canSend) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setValue('');
      requestAnimationFrame(resize);
    } catch {
      // The caller surfaces the error; keep the draft so nothing is lost.
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className={cn('flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40', className)}
      onSubmit={event => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={textarea}
        value={value}
        onChange={event => {
          setValue(event.target.value);
          resize();
        }}
        onKeyDown={onKeyDown}
        rows={1}
        maxLength={ASK_AI_MESSAGE_MAX_LENGTH}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        disabled={disabled}
        autoFocus={autoFocus}
        className="max-h-60 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />
      {busy && onStop ? (
        <Button type="button" size="icon" variant="secondary" className="rounded-full" onClick={onStop} aria-label={t('stop')}>
          <Square className="size-3.5 fill-current" />
        </Button>
      ) : (
        <Button type="submit" size="icon" className="rounded-full" disabled={!canSend} aria-label={t('send')}>
          <ArrowUp />
        </Button>
      )}
    </form>
  );
}
