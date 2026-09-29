'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ResetPasswordRequestSchema, type ResetPasswordRequest } from '@boilerplate/shared-schemas';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { authApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { AuthCard } from '../_components/auth-card';
import { useAuthSuccess } from '../_hooks/use-auth-success';
import { useResendCountdown } from '../_hooks/use-resend-countdown';

function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const onSuccess = useAuthSuccess();
  const countdown = useResendCountdown();
  const [codeSent, setCodeSent] = useState(false);
  const form = useForm<ResetPasswordRequest>({
    resolver: zodResolver(ResetPasswordRequestSchema),
    defaultValues: { email: '', code: '', password: '' },
  });

  const sendCode = useMutation({
    mutationFn: (email: string) => authApi.sendOtp(email, 'reset-password'),
    onSuccess: result => {
      setCodeSent(true);
      countdown.start(result.resendAfterSeconds);
    },
    onError: error => toast.error(errorMessage(error, tErrors)),
  });
  const reset = useMutation({ mutationFn: authApi.resetPassword, onSuccess, onError: error => toast.error(errorMessage(error, tErrors)) });

  const { errors } = form.formState;
  const requestCode = () => void form.trigger('email').then(ok => ok && sendCode.mutate(form.getValues('email')));

  return (
    <AuthCard
      title={t('forgotTitle')}
      description={t('forgotSubtitle')}
      footer={
        <Link href="/auth/sign-in" className="underline-offset-4 hover:underline">
          {t('backToSignIn')}
        </Link>
      }
    >
      <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(values => reset.mutate(values))}>
        <FormField
          label={t('email')}
          type="email"
          autoComplete="email"
          readOnly={codeSent}
          error={errors.email?.message}
          {...form.register('email')}
        />
        {codeSent ? (
          <>
            <FormField
              label={t('code')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              hint={t('codeSent', { email: form.getValues('email') })}
              error={errors.code?.message}
              {...form.register('code')}
            />
            <FormField
              label={t('newPassword')}
              type="password"
              autoComplete="new-password"
              hint={t('passwordHint')}
              error={errors.password?.message}
              {...form.register('password')}
            />
            <Button type="submit" disabled={reset.isPending}>
              {reset.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t('resetPassword')}
            </Button>
            <Button type="button" variant="ghost" disabled={countdown.seconds > 0 || sendCode.isPending} onClick={requestCode}>
              {countdown.seconds > 0 ? t('resendIn', { seconds: countdown.seconds }) : t('resend')}
            </Button>
          </>
        ) : (
          <Button type="button" disabled={sendCode.isPending} onClick={requestCode}>
            {sendCode.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {t('sendCode')}
          </Button>
        )}
      </form>
    </AuthCard>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
