import { PrismaClient, type Prisma } from '@prisma/client';
import { normalizeDatabaseUrl } from './database-url.js';

const globalForPrisma = globalThis as unknown as { __boilerplatePrisma?: PrismaClient };

/**
 * Build a Prisma client. Pool size and timeout are configured on the URL:
 * `mysql://user:pass@host:3306/db?connection_limit=10&pool_timeout=20`.
 */
export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  const options: Prisma.PrismaClientOptions = {
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    ...(databaseUrl ? { datasources: { db: { url: normalizeDatabaseUrl(databaseUrl) } } } : {}),
  };
  return new PrismaClient(options);
}

/**
 * Process-wide singleton. Kept on globalThis outside production so hot reload
 * (tsx watch / Next dev) does not open a new pool on every reload.
 */
export const prisma = globalForPrisma.__boilerplatePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__boilerplatePrisma = prisma;
}
