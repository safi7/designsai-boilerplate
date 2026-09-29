/** Central query-key factory: one place to reason about cache invalidation. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  providers: ['auth', 'providers'] as const,
  sessions: ['auth', 'sessions'] as const,
  credits: {
    all: ['credits'] as const,
    balance: ['credits', 'balance'] as const,
    transactions: ['credits', 'transactions'] as const,
    packages: ['credits', 'packages'] as const,
  },
  threads: {
    all: ['threads'] as const,
    list: (search: string) => ['threads', 'list', search] as const,
    detail: (threadId: string) => ['threads', 'detail', threadId] as const,
  },
};
