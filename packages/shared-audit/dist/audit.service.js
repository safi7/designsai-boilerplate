import { AuditStatus } from '@boilerplate/shared-prisma';
const MAX_USER_AGENT = 500;
/**
 * Append-only audit trail.
 *
 * `record` is fire-and-forget by design: an audit write failing must never
 * fail the user's request. It is logged loudly instead so the gap is visible.
 * Use `log` when the caller needs to await the write (e.g. in scripts).
 */
export class AuditService {
    prisma;
    logger;
    constructor(prisma, logger) {
        this.prisma = prisma;
        this.logger = logger;
    }
    async log(input) {
        return this.prisma.auditLog.create({
            data: {
                userId: input.userId ?? null,
                action: input.action,
                resourceType: input.resourceType,
                resourceId: input.resourceId ?? null,
                status: input.status ?? AuditStatus.success,
                description: input.description ?? null,
                changes: input.changes ?? undefined,
                metadata: input.metadata ?? undefined,
                ipAddress: input.ipAddress ?? null,
                userAgent: input.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
                requestId: input.requestId ?? null,
                requestMethod: input.requestMethod ?? null,
                endpoint: input.endpoint ?? null,
                errorMessage: input.errorMessage ?? null,
            },
        });
    }
    record(input) {
        this.log(input).catch((error) => {
            this.logger.error('Audit log write failed', {
                action: input.action,
                resourceType: input.resourceType,
                userId: input.userId?.toString(),
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }
    async query(filter) {
        const where = {
            ...(filter.userId !== undefined ? { userId: filter.userId } : {}),
            ...(filter.action ? { action: filter.action } : {}),
            ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
            ...(filter.from || filter.to ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
        };
        const [total, logs] = await this.prisma.$transaction([
            this.prisma.auditLog.count({ where }),
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: Math.min(filter.limit ?? 50, 200),
                skip: filter.offset ?? 0,
            }),
        ]);
        return { total, logs };
    }
}
//# sourceMappingURL=audit.service.js.map