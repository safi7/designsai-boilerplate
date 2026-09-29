'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { EmailSchema, LoginRequestSchema, OtpCodeSchema, type LoginRequest } from '@boilerplate/shared-schemas';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints';
import { config } from '@/lib/config';
import { errorMessage } from '@/lib/error-messages';
import { AuthCard } from '../../_components/auth-card';
import { GoogleSignIn } from '../../_components/google-sign-in';
import { useAuthSuccess } from '../../_hooks/use-auth-success';
import { useResendCountdown } from '../../_hooks/use-resend-countdown';

const CodeFormSchema = z.object({ email: EmailSchema, code: OtpCodeSchema });
type Mode = 'password' | 'code';

export function SignInForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const onSuccess = useAuthSuccess();
  const [mode, setMode] = useState<Mode>('password');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const countdown = useResendCountdown();

  const passwordForm = useForm<LoginRequest>({ resolver: zodResolver(LoginRequestSchema), defaultValues: { email: '', password: '' } });
  const codeForm = useForm<z.infer<typeof CodeFormSchema>>({ resolver: zodResolver(CodeFormSchema), defaultValues: { email: '', code: '' } });

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess,
    onError: (error, variables) => {
      if (error instanceof ApiError && error.code === 'email_not_verified') {
        void authApi.sendOtp(variables.email, 'verify-email').catch(() => undefined);
        router.push(`/auth/verify-email?email=${encodeURIComponent(variables.email)}`);
        return;
      }
      toast.error(errorMessage(error, tErrors));
    },
  });

  const sendCode = useMutation({
    mutationFn: (email: string) => authApi.sendOtp(email, 'sign-in'),
    onSuccess: (result, email) => {
      setCodeSentTo(email);
      countdown.start(result.resendAfterSeconds);
    },
    onError: error => toast.error(errorMessage(error, tErrors)),
  });

  const verifyCode = useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) => authApi.otpSignIn(email, code),
    onSuccess,
    onError: error => toast.error(errorMessage(error, tErrors)),
  });

  const switchMode = (next: Mode) => {
    const email = mode === 'password' ? passwordForm.getValues('email') : codeForm.getValues('email');
    if (next === 'password') passwordForm.setValue('email', email);
    else codeForm.setValue('email', email);
    setCodeSentTo(null);
    setMode(next);
  };

  return (
    <AuthCard
      title={t('signInTitle')}
      description={t('signInSubtitle', { appName: config.appName })}
      footer={
        <span>
          {t('noAccount')}{' '}
          <Link href="/auth/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t('signUp')}
          </Link>
        </span>
      }
    >
      <GoogleSignIn />

      {mode === 'password' ? (
        <form className="grid gap-4" noValidate onSubmit={passwordForm.handleSubmit(values => login.mutate(values))}>
          <FormField
            label={t('email')}
            type="email"
            autoComplete="email"
            error={passwordForm.formState.errors.email?.message}
            {...passwordForm.register('email')}
          />
          <FormField
            label={t('password')}
            type="password"
            autoComplete="current-password"
            error={passwordForm.formState.errors.password?.message}
            labelAction={
              <Link href="/auth/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                {t('forgotPassword')}
              </Link>
            }
            {...passwordForm.register('password')}
          />
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {t('signIn')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => switchMode('code')}>
            {t('emailCode')}
          </Button>
        </form>
      ) : (
        <form className="grid gap-4" noValidate onSubmit={codeForm.handleSubmit(values => verifyCode.mutate(values))}>
          <FormField
            label={t('email')}
            type="email"
            autoComplete="email"
            readOnly={Boolean(codeSentTo)}
            error={codeForm.formState.errors.email?.message}
            {...codeForm.register('email')}
          />
          {codeSentTo ? (
            <>
              <FormField
                label={t('code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                hint={t('codeSent', { email: codeSentTo })}
                error={codeForm.formState.errors.code?.message}
                {...codeForm.register('code')}
              />
              <Button type="submit" disabled={verifyCode.isPending}>
                {verifyCode.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {t('signIn')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={countdown.seconds > 0 || sendCode.isPending}
                onClick={() => sendCode.mutate(codeSentTo)}
              >
                {countdown.seconds > 0 ? t('resendIn', { seconds: countdown.seconds }) : t('resend')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={sendCode.isPending}
              onClick={() => void codeForm.trigger('email').then(ok => ok && sendCode.mutate(codeForm.getValues('email')))}
            >
              {sendCode.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t('sendCode')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => switchMode('password')}>
            {t('usePassword')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
