import type { UserResponse } from '@boilerplate/shared-schemas';
import { create } from 'zustand';

/**
 * Client-side view of the session. The source of truth is the httpOnly
 * cookie + `GET /v1/auth/me`; this store only caches the resolved user so
 * components can read it synchronously. Nothing sensitive is persisted.
 */
interface AuthState {
  user: UserResponse | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
  setUser: (user: UserResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(set => ({
  user: null,
  status: 'unknown',
  setUser: user => set({ user, status: 'authenticated' }),
  clear: () => set({ user: null, status: 'anonymous' }),
}));
