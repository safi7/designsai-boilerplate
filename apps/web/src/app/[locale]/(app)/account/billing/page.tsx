'use client';

import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Coins, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Suspense, useEffect } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditBalance } from '@/hooks/use-credit-balance';
import { creditsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

function BillingContent() {
  const t = useTranslations('billing');
  const tErrors = useTranslations('errors');
  const format = useFormatter();
  const locale = useLocale();
  const params = useSearchParams();
  const balance = useCreditBalance();
  const packages = useQuery({ queryKey: queryKeys.credits.packages, queryFn: creditsApi.packages });
  const history = useInfiniteQuery({
    queryKey: queryKeys.credits.transactions,
    queryFn: ({ pageParam }) => creditsApi.transactions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
  });
  const checkout = useMutation({
    mutationFn: (packageId: string) => creditsApi.checkout(packageId, locale),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
    onError: error => toast.error(errorMessage(error, tErrors)),
  });

  const checkoutState = params.get('checkout');
  useEffect(() => {
    if (checkoutState === 'success') toast.success(t('checkoutSuccess'));
    if (checkoutState === 'cancelled') toast(t('checkoutCancelled'));
  }, [checkoutState, t]);

  const transactions = history.data?.pages.flatMap(p => p.items) ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

        <Card>
          <CardHeader>
            <CardDescription>{t('balance')}</CardDescription>
            <CardTitle className="flex items-center gap-2 text-4xl tabular-nums">
              <Coins className="size-7 text-muted-foreground" aria-hidden />
              {balance.data ? balance.data.balance : <Skeleton className="h-10 w-24" />}
            </CardTitle>
          </CardHeader>
          {balance.data?.nextExpiry ? (
            <CardContent className="text-sm text-muted-foreground">
              {t('expiring', {
                amount: balance.data.nextExpiry.amount,
                date: format.dateTime(new Date(balance.data.nextExpiry.expiresAt), { dateStyle: 'medium' }),
              })}
            </CardContent>
          ) : null}
        </Card>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t('buy')}</h2>
          {packages.data && !packages.data.checkoutEnabled ? (
            <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">{t('checkoutDisabled')}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {packages.data?.packages.map(pkg => (
              <Card key={pkg.packageId} className="gap-4">
                <CardHeader>
                  <CardTitle>{pkg.name}</CardTitle>
                  <CardDescription>{t('packCredits', { credits: format.number(pkg.credits) })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums">
                    {format.number(Number(pkg.price), { style: 'currency', currency: pkg.currency })}
                  </p>
                  <p className="text-xs text-muted-foreground">{pkg.validityDays ? t('validity', { days: pkg.validityDays }) : t('noExpiry')}</p>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    disabled={!packages.data.checkoutEnabled || checkout.isPending}
                    onClick={() => checkout.mutate(pkg.packageId)}
                  >
                    {checkout.isPending && checkout.variables === pkg.packageId ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    {t('purchase')}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{t('history')}</h2>
          <Card className="py-0">
            {transactions.length === 0 && !history.isPending ? (
              <p className="p-6 text-sm text-muted-foreground">{t('noHistory')}</p>
            ) : (
              <ul className="divide-y">
                {transactions.map(tx => {
                  const negative = tx.type === 'usage' || tx.type === 'expiry';
                  return (
                    <li key={tx.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <Badge variant="outline">{t(`types.${tx.type}`)}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{tx.description ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format.dateTime(new Date(tx.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      <span className={cn('font-medium tabular-nums', negative ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400')}>
                        {negative ? '−' : '+'}
                        {tx.amount}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {history.hasNextPage ? (
            <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              {history.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t('history')}
            </Button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}
