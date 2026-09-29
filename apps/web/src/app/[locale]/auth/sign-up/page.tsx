'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterRequestSchema, type RegisterRequest } from '@boilerplate/shared-schemas';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints';
import { config } from '@/lib/config';
import { errorMessage } from '@/lib/error-messages';
import { AuthCard } from '../_components/auth-card';
import { GoogleSignIn } from '../_components/google-sign-in';

function SignUpForm() {
  const t = useTranslations('auth');
  const tErrors = useTranslations('errors');
  const locale = useLocale() as RegisterRequest['language'];
  const router = useRouter();
  const form = useForm<RegisterRequest>({
    resolver: zodResolver(RegisterRequestSchema),
    defaultValues: { name: '', lastName: '', email: '', password: '', language: locale },
  });

  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: result => router.push(`/auth/verify-email?email=${encodeURIComponent(result.email)}`),
    onError: error => {
      if (error instanceof ApiError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof RegisterRequest, { message: messages[0] });
        }
      }
      toast.error(errorMessage(error, tErrors));
    },
  });

  const { errors } = form.formState;
  return (
    <AuthCard
      title={t('signUpTitle')}
      description={t('signUpSubtitle', { bonus: config.signupBonusCredits })}
      footer={
        <span>
          {t('haveAccount')}{' '}
          <Link href="/auth/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t('signIn')}
          </Link>
        </span>
      }
    >
      <GoogleSignIn />
      <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(values => register.mutate(values))}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('firstName')} autoComplete="given-name" error={errors.name?.message} {...form.register('name')} />
          <FormField label={t('lastName')} autoComplete="family-name" error={errors.lastName?.message} {...form.register('lastName')} />
        </div>
        <FormField label={t('email')} type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <FormField
          label={t('password')}
          type="password"
          autoComplete="new-password"
          hint={t('passwordHint')}
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t('signUp')}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
