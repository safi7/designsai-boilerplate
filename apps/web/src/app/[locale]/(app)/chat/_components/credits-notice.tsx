'use client';

import { Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export function CreditsNotice() {
  const t = useTranslations('chat');
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm">
      <span className="flex items-center gap-2">
        <Coins className="size-4 text-muted-foreground" aria-hidden />
        {t('outOfCredits')}
      </span>
      <Button asChild size="sm">
        <Link href="/account/billing">{t('buyCredits')}</Link>
      </Button>
    </div>
  );
}
