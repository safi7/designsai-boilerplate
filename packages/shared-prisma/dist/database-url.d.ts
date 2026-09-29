/**
 * Normalise a MySQL connection string so special characters in the password
 * are URL-encoded. Secret managers happily generate passwords like `p@ss(w)rd`
 * that break Prisma's URL parser when interpolated raw.
 *
 * Idempotent: decoding before encoding means a second pass is a no-op.
 */
export declare function normalizeDatabaseUrl(databaseUrl: string): string;
//# sourceMappingURL=database-url.d.ts.map