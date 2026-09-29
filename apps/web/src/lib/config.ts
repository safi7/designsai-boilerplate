/** Public runtime configuration. Everything here ships to the browser. */
export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Boilerplate AI',
  signupBonusCredits: Number(process.env.NEXT_PUBLIC_SIGNUP_BONUS_CREDITS ?? 50),
  authCookieName: process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME ?? 'auth_token',
} as const;
