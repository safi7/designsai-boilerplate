export { prisma, createPrismaClient } from './client.js';
export { normalizeDatabaseUrl } from './database-url.js';

// Re-export the generated client so consumers depend on this package only.
export * from '@prisma/client';
