'use client';

import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';

export function useCurrentUser() {
  return useQuery({ queryKey: queryKeys.me, queryFn: authApi.me, staleTime: 5 * 60_000 });
}
