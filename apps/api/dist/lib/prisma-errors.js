/** Prisma unique-constraint violation (used to detect lost idempotency races). */
export function isUniqueViolation(error) {
    return typeof error === 'object' && error !== null && error.code === 'P2002';
}
//# sourceMappingURL=prisma-errors.js.map