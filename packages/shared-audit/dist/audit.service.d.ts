import type { Logger } from '@boilerplate/shared-logger';
import { AuditStatus, type AuditAction, type AuditLog, type AuditResourceType, type PrismaClient } from '@boilerplate/shared-prisma';
export interface AuditLogInput {
    userId?: bigint | null;
    action: AuditAction;
    resourceType: AuditResourceType;
    resourceId?: string | null;
    status?: AuditStatus;
    description?: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    requestMethod?: string | null;
    endpoint?: string | null;
    errorMessage?: string | null;
}
export interface AuditLogQuery {
    userId?: bigint;
    action?: AuditAction;
    resourceType?: AuditResourceType;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
}
export type AuditLogRecord = AuditLog;
/**
 * Append-only audit trail.
 *
 * `record` is fire-and-forget by design: an audit write failing must never
 * fail the user's request. It is logged loudly instead so the gap is visible.
 * Use `log` when the caller needs to await the write (e.g. in scripts).
 */
export declare class AuditService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaClient, logger: Logger);
    log(input: AuditLogInput): Promise<AuditLogRecord>;
    record(input: AuditLogInput): void;
    query(filter: AuditLogQuery): Promise<{
        total: number;
        logs: AuditLogRecord[];
    }>;
}
//# sourceMappingURL=audit.service.d.ts.map