import { PrismaClient, type Prisma } from '@prisma/client';
/**
 * Build a Prisma client. Pool size and timeout are configured on the URL:
 * `mysql://user:pass@host:3306/db?connection_limit=10&pool_timeout=20`.
 */
export declare function createPrismaClient(databaseUrl?: string | undefined): PrismaClient;
/**
 * Process-wide singleton. Kept on globalThis outside production so hot reload
 * (tsx watch / Next dev) does not open a new pool on every reload.
 */
export declare const prisma: PrismaClient<Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
//# sourceMappingURL=client.d.ts.map