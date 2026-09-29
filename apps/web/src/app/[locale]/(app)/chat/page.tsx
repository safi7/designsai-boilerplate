'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import { threadsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';
import { Composer } from './_components/composer';
import { CreditsNotice } from './_components/credits-notice';

const STARTERS = ['explain', 'plan', 'code', 'email'] as const;

export default function NewChatPage() {
  const t = useTranslations('chat');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [outOfCredits, setOutOfCredits] = useState(false);

  const create = useMutation({
    mutationFn: threadsApi.create,
    onSuccess: ({ threadId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads.all });
      router.push(`/chat/${threadId}`);
    },
    onError: error => {
      if (error instanceof ApiError && error.code === 'insufficient_credits') setOutOfCredits(true);
      else toast.error(errorMessage(error, tErrors));
    },
  });

  return (
    <div className="flex h-full flex-col items-center justify-center px-4 pb-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-center text-3xl font-semibold tracking-tight">{t('heroTitle')}</h1>
        <p className="mt-2 text-center text-muted-foreground">{t('heroSubtitle')}</p>
        <div className="mt-8 grid gap-3">
          {outOfCredits ? <CreditsNotice /> : null}
          <Composer onSubmit={content => create.mutateAsync(content)} busy={create.isPending} autoFocus />
          <div className="grid gap-2 sm:grid-cols-2">
            {STARTERS.map(key => (
              <Button
                key={key}
                variant="outline"
                className="h-auto justify-start py-3 text-left whitespace-normal text-muted-foreground hover:text-foreground"
                disabled={create.isPending}
                onClick={() => create.mutate(t(`starters.${key}`))}
              >
                {t(`starters.${key}`)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
