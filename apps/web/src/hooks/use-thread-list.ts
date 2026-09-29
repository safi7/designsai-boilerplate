'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { threadsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';

export function useThreadList(search: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.threads.list(search),
    queryFn: ({ pageParam }) => threadsApi.list({ cursor: pageParam, search: search || undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.pageInfo.hasMore ? (last.pageInfo.nextCursor ?? undefined) : undefined),
  });
}
