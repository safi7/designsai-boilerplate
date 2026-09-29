'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, setUnauthorizedHandler } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Resolves the session before rendering the app. The edge proxy only checks
 * that a cookie exists; this confirms with the API and, on any later 401,
 * signs the user out globally.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, error } = useCurrentUser();
  const setUser = useAuthStore(s => s.setUser);
  const clear = useAuthStore(s => s.clear);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
      queryClient.clear();
      router.replace(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
    });
  }, [clear, queryClient, router, pathname]);

  useEffect(() => {
    if (user) setUser(user);
  }, [user, setUser]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [error, router, pathname]);

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  return <>{children}</>;
}
