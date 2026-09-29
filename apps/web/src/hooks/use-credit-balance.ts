'use client';

import { useQuery } from '@tanstack/react-query';
import { creditsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';

export function useCreditBalance() {
  return useQuery({ queryKey: queryKeys.credits.balance, queryFn: creditsApi.balance });
}
