'use client';

import type { AuthResponse } from '@boilerplate/shared-schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { queryKeys } from '@/lib/query-keys';
import { safeNextPath } from '@/lib/safe-redirect';
import { useAuthStore } from '@/stores/auth.store';

export function useAuthSuccess() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const setUser = useAuthStore(s => s.setUser);

  return (response: AuthResponse) => {
    setUser(response.user);
    queryClient.setQueryData(queryKeys.me, response.user);
    router.replace(safeNextPath(params.get('next')));
  };
}
