/** Per-request context shared by middleware and handlers. */
export interface AuthContext {
  userId: bigint;
  sessionId: string;
  email: string;
}

export interface AppVariables {
  requestId: string;
  auth: AuthContext | undefined;
}

export interface AppEnv {
  Variables: AppVariables;
}
