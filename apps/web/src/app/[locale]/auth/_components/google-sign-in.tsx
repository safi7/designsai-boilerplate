'use client';

import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { authApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/error-messages';
import { queryKeys } from '@/lib/query-keys';
import { useAuthSuccess } from '../_hooks/use-auth-success';

/** Renders only when the API reports Google sign-in as configured. */
export function GoogleSignIn() {
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const onSuccess = useAuthSuccess();
  const { data } = useQuery({ queryKey: queryKeys.providers, queryFn: authApi.providers, staleTime: Infinity });
  const mutation = useMutation({ mutationFn: authApi.google, onSuccess, onError: error => toast.error(errorMessage(error, tErrors)) });

  if (!data?.google.enabled || !data.google.clientId) return null;

  return (
    <>
      <GoogleOAuthProvider clientId={data.google.clientId}>
        <div className="flex justify-center">
          <GoogleLogin
            locale={locale}
            width="320"
            onSuccess={response => response.credential && mutation.mutate(response.credential)}
            onError={() => toast.error(tErrors('sso_failed'))}
          />
        </div>
      </GoogleOAuthProvider>
      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {tCommon('or')}
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
