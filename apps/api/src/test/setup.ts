// Deterministic environment for every test file. Nothing here opens a
// connection: Redis and Prisma clients connect lazily on first use.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'mysql://test:test@localhost:3306/test';
process.env.REDIS_URL ??= 'redis://localhost:6379/15';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters';
process.env.API_TO_AGENTS_INTERNAL_TOKEN = 'test-internal-token-that-is-at-least-32-chars';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.WEB_APP_URL = 'http://localhost:3000';
