'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { OtpCodeSchema } from '@boilerplate/shared-schemas';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { authApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { AuthCard } from '../_components/auth-card';
import { useAuthSuccess } from '../_hooks/use-auth-success';
import { useResendCountdown } from '../_hooks/use-resend-countdown';

const Schema = z.object({ code: OtpCodeSchema });

function VerifyEmailForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const email = useSearchParams().get('email') ?? '';
  const onSuccess = useAuthSuccess();
  const countdown = useResendCountdown(30);
  const form = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { code: '' } });

  const verify = useMutation({
    mutationFn: (code: string) => authApi.verifyEmail(email, code),
    onSuccess,
    onError: error => toast.error(errorMessage(error, tErrors)),
  });
  const resend = useMutation({
    mutationFn: () => authApi.sendOtp(email, 'verify-email'),
    onSuccess: result => countdown.start(result.resendAfterSeconds),
    onError: error => toast.error(errorMessage(error, tErrors)),
  });

  return (
    <AuthCard
      title={t('verifyTitle')}
      description={t('verifySubtitle', { email })}
      footer={
        <Link href="/auth/sign-in" className="underline-offset-4 hover:underline">
          {t('backToSignIn')}
        </Link>
      }
    >
      <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(values => verify.mutate(values.code))}>
        <FormField
          label={t('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          error={form.formState.errors.code?.message}
          {...form.register('code')}
        />
        <Button type="submit" disabled={verify.isPending || !email}>
          {verify.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t('verify')}
        </Button>
        <Button type="button" variant="ghost" disabled={countdown.seconds > 0 || resend.isPending || !email} onClick={() => resend.mutate()}>
          {countdown.seconds > 0 ? t('resendIn', { seconds: countdown.seconds }) : t('resend')}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
