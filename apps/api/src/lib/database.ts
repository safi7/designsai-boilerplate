import { createPrismaClient, type PrismaClient } from '@boilerplate/shared-prisma';
import { config } from './config.js';

const globalForDb = globalThis as unknown as { __apiPrisma?: PrismaClient };

export const prisma: PrismaClient = globalForDb.__apiPrisma ?? createPrismaClient(config.databaseUrl);
if (!config.isProduction) globalForDb.__apiPrisma = prisma;

export { isUniqueViolation } from './prisma-errors.js';
