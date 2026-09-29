import type {
  AgentThread,
  AgentThreadListResponse,
  AuthProvidersResponse,
  AuthResponse,
  ChangePasswordRequest,
  CheckoutResponse,
  CreateThreadResponse,
  CreditBalanceResponse,
  CreditPackageListResponse,
  CreditTransactionListResponse,
  LoginRequest,
  OtpPurpose,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  SendMessageResponse,
  Session,
  ThreadDetailResponse,
  UpdateProfileRequest,
  UpdateThreadRequest,
  UserResponse,
} from '@boilerplate/shared-schemas';
import { apiFetch, apiUrl } from './client';

/**
 * Typed endpoint map. Request/response types come straight from the shared
 * Zod contracts the API validates against, so a contract change is a compile
 * error here rather than a runtime surprise.
 */
export const authApi = {
  providers: () => apiFetch<AuthProvidersResponse>('/v1/auth/providers'),
  me: () => apiFetch<UserResponse>('/v1/auth/me'),
  register: (body: RegisterRequest) => apiFetch<RegisterResponse>('/v1/auth/register', { method: 'POST', body }),
  verifyEmail: (email: string, code: string) => apiFetch<AuthResponse>('/v1/auth/verify-email', { method: 'POST', body: { email, code } }),
  login: (body: LoginRequest) => apiFetch<AuthResponse>('/v1/auth/login', { method: 'POST', body, skipAuthRedirect: true }),
  sendOtp: (email: string, purpose: OtpPurpose) =>
    apiFetch<{ success: true; resendAfterSeconds: number }>('/v1/auth/otp/send', { method: 'POST', body: { email, purpose } }),
  otpSignIn: (email: string, code: string) => apiFetch<AuthResponse>('/v1/auth/otp/sign-in', { method: 'POST', body: { email, code } }),
  resetPassword: (body: ResetPasswordRequest) => apiFetch<AuthResponse>('/v1/auth/password/reset', { method: 'POST', body }),
  google: (credential: string) => apiFetch<AuthResponse>('/v1/auth/google', { method: 'POST', body: { credential }, skipAuthRedirect: true }),
  logout: () => apiFetch<{ success: true }>('/v1/auth/logout', { method: 'POST', skipAuthRedirect: true }),
  logoutAll: () => apiFetch<{ success: true }>('/v1/auth/logout-all', { method: 'POST' }),
  changePassword: (body: ChangePasswordRequest) => apiFetch<{ success: true }>('/v1/auth/password/change', { method: 'POST', body }),
  sessions: () => apiFetch<{ sessions: Session[] }>('/v1/auth/sessions'),
  revokeSession: (id: string) => apiFetch<{ success: true }>(`/v1/auth/sessions/${id}`, { method: 'DELETE' }),
};

export const usersApi = {
  updateProfile: (body: UpdateProfileRequest) => apiFetch<UserResponse>('/v1/users/me', { method: 'PATCH', body }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<UserResponse>('/v1/users/me/avatar', { method: 'POST', body: form });
  },
  removeAvatar: () => apiFetch<UserResponse>('/v1/users/me/avatar', { method: 'DELETE' }),
};

export const creditsApi = {
  balance: () => apiFetch<CreditBalanceResponse>('/v1/credits/balance'),
  transactions: (cursor?: string) => apiFetch<CreditTransactionListResponse>('/v1/credits/transactions', { query: { cursor, limit: 20 } }),
  packages: () => apiFetch<CreditPackageListResponse>('/v1/credits/packages'),
  checkout: (packageId: string, locale: string) =>
    apiFetch<CheckoutResponse>('/v1/credits/checkout', { method: 'POST', body: { packageId }, query: { locale } }),
};

export const threadsApi = {
  list: (params: { cursor?: string; search?: string }) =>
    apiFetch<AgentThreadListResponse>('/v1/agents/threads', { query: { ...params, limit: 30 } }),
  get: (threadId: string) => apiFetch<ThreadDetailResponse>(`/v1/agents/threads/${threadId}`),
  update: (threadId: string, body: UpdateThreadRequest) => apiFetch<AgentThread>(`/v1/agents/threads/${threadId}`, { method: 'PATCH', body }),
  remove: (threadId: string) => apiFetch<{ success: true }>(`/v1/agents/threads/${threadId}`, { method: 'DELETE' }),
  create: (content: string) => apiFetch<CreateThreadResponse>('/v1/agents/ask-ai/threads', { method: 'POST', body: { content } }),
  send: (threadId: string, content: string) =>
    apiFetch<SendMessageResponse>(`/v1/agents/threads/${threadId}/messages`, { method: 'POST', body: { content } }),
  cancel: (threadId: string) => apiFetch<{ cancelled: boolean }>(`/v1/agents/threads/${threadId}/cancel`, { method: 'POST' }),
  eventsUrl: (threadId: string, cursor: number) => apiUrl(`/v1/agents/ask-ai/threads/${threadId}/events`, { cursor }),
};
