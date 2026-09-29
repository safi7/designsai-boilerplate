'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import { threadsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { ConversationView } from '../_components/conversation-view';

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const tNotFound = useTranslations('notFound');
  const tCommon = useTranslations('common');
  // Read once per mount: after hydration the SSE stream is the source of truth,
  // so background refetches would only fight the live reducer.
  const detail = useQuery({
    queryKey: queryKeys.threads.detail(threadId),
    queryFn: () => threadsApi.get(threadId),
    staleTime: Infinity,
    gcTime: 0,
  });

  if (detail.isPending) {
    return (
      <div className="flex h-full items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (detail.isError) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{missing ? tNotFound('title') : tCommon('retry')}</p>
        <Button asChild variant="outline">
          <Link href="/chat">{tNotFound('back')}</Link>
        </Button>
      </div>
    );
  }
  return <ConversationView key={threadId} detail={detail.data} />;
}
