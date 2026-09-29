'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/i18n/navigation';
import { authApi } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth.store';

export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clear = useAuthStore(s => s.clear);

  return async ({ everywhere = false }: { everywhere?: boolean } = {}) => {
    try {
      await (everywhere ? authApi.logoutAll() : authApi.logout());
    } finally {
      // Drop every cached query so nothing from this account survives into the next one.
      queryClient.clear();
      clear();
      router.replace('/auth/sign-in');
    }
  };
}
