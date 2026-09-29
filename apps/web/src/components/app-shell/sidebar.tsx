'use client';

import { Coins, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditBalance } from '@/hooks/use-credit-balance';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useThreadList } from '@/hooks/use-thread-list';
import { Link } from '@/i18n/navigation';
import { config } from '@/lib/config';
import { ThreadRow } from './thread-row';
import { UserMenu } from './user-menu';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const threads = useThreadList(debounced);
  const balance = useCreditBalance();

  const items = useMemo(() => threads.data?.pages.flatMap(p => p.items) ?? [], [threads.data]);
  const favorites = items.filter(item => item.isFavorite);
  const recent = items.filter(item => !item.isFavorite);

  return (
    <nav aria-label="Conversations" className="flex h-full flex-col gap-2 bg-sidebar p-3 text-sidebar-foreground">
      <div className="flex items-center gap-2 px-1 py-1 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="size-3.5" aria-hidden />
        </span>
        {config.appName}
      </div>

      <Button asChild variant="outline" className="justify-start">
        <Link href="/chat" onClick={onNavigate}>
          <Plus />
          {t('newChat')}
        </Link>
      </Button>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('searchChats')}
          aria-label={t('searchChats')}
          className="pl-8"
          maxLength={100}
        />
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {threads.isPending ? (
          <div className="grid gap-2 pt-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 pt-4 text-sm text-muted-foreground">{t('noChats')}</p>
        ) : (
          <>
            {favorites.length > 0 ? (
              <section className="pt-2">
                <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t('favorites')}</h2>
                {favorites.map(thread => (
                  <ThreadRow key={thread.id} thread={thread} onNavigate={onNavigate} />
                ))}
              </section>
            ) : null}
            <section className="pt-2">
              <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{t('recent')}</h2>
              {recent.map(thread => (
                <ThreadRow key={thread.id} thread={thread} onNavigate={onNavigate} />
              ))}
            </section>
            {threads.hasNextPage ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full"
                disabled={threads.isFetchingNextPage}
                onClick={() => void threads.fetchNextPage()}
              >
                {threads.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {t('loadMore')}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <div className="grid gap-1 border-t border-sidebar-border pt-2">
        <Link href="/account/billing" onClick={onNavigate} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent">
          <Coins className="size-4 text-muted-foreground" aria-hidden />
          <span>{balance.data ? tCommon('credits', { amount: balance.data.balance }) : '—'}</span>
        </Link>
        <UserMenu />
      </div>
    </nav>
  );
}
