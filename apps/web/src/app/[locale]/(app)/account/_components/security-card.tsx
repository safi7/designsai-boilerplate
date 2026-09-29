'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PasswordSchema, type UserResponse } from '@boilerplate/shared-schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Loader2 } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useSignOut } from '@/hooks/use-sign-out';
import { authApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';

const PasswordFormSchema = z.object({ currentPassword: z.string().max(128), newPassword: PasswordSchema });
type PasswordForm = z.infer<typeof PasswordFormSchema>;

/** Browser + OS from a user agent, good enough for a session list. */
function describeDevice(userAgent: string | null, fallback: string): string {
  if (!userAgent) return fallback;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS X/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return [browser, os].filter(Boolean).join(' · ') || fallback;
}

export function SecurityCard({ user }: { user: UserResponse }) {
  const t = useTranslations('account');
  const tErrors = useTranslations('errors');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const sessions = useQuery({ queryKey: queryKeys.sessions, queryFn: authApi.sessions });
  const form = useForm<PasswordForm>({ resolver: zodResolver(PasswordFormSchema), defaultValues: { currentPassword: '', newPassword: '' } });

  const change = useMutation({
    mutationFn: (values: PasswordForm) =>
      authApi.changePassword({ currentPassword: values.currentPassword || undefined, newPassword: values.newPassword }),
    onSuccess: () => {
      form.reset();
      toast.success(t('passwordChanged'));
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
    onError: error => toast.error(errorMessage(error, tErrors)),
  });
  const revoke = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
    onError: error => toast.error(errorMessage(error, tErrors)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('security')}</CardTitle>
        <CardDescription>{t('securityDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(values => change.mutate(values))}>
          {user.hasPassword ? (
            <FormField label={t('currentPassword')} type="password" autoComplete="current-password" {...form.register('currentPassword')} />
          ) : null}
          <FormField
            label={t('setPassword')}
            type="password"
            autoComplete="new-password"
            error={form.formState.errors.newPassword?.message}
            {...form.register('newPassword')}
          />
          <div>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {user.hasPassword ? t('changePassword') : t('setPassword')}
            </Button>
          </div>
        </form>

        <Separator />

        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t('sessions')}</h3>
            <Button variant="outline" size="sm" onClick={() => void signOut({ everywhere: true })}>
              {t('signOutEverywhere')}
            </Button>
          </div>
          <ul className="grid gap-2">
            {sessions.data?.sessions.map(session => (
              <li key={session.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                <Laptop className="size-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {describeDevice(session.userAgent, t('unknownDevice'))}
                    {session.current ? <Badge variant="secondary">{t('thisDevice')}</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('lastActive', { date: format.relativeTime(new Date(session.lastUsedAt), now) })}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                  </p>
                </div>
                {!session.current ? (
                  <Button variant="ghost" size="sm" disabled={revoke.isPending} onClick={() => revoke.mutate(session.id)}>
                    {t('revoke')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
