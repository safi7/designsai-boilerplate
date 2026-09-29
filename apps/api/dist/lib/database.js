import { createPrismaClient } from '@boilerplate/shared-prisma';
import { config } from './config.js';
const globalForDb = globalThis;
export const prisma = globalForDb.__apiPrisma ?? createPrismaClient(config.databaseUrl);
if (!config.isProduction)
    globalForDb.__apiPrisma = prisma;
export { isUniqueViolation } from './prisma-errors.js';
//# sourceMappingURL=database.js.map