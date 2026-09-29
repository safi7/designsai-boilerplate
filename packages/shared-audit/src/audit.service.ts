import type { Logger } from '@boilerplate/shared-logger';
import { AuditStatus, type Prisma, type AuditAction, type AuditLog, type AuditResourceType, type PrismaClient } from '@boilerplate/shared-prisma';

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

const MAX_USER_AGENT = 500;

/**
 * Append-only audit trail.
 *
 * `record` is fire-and-forget by design: an audit write failing must never
 * fail the user's request. It is logged loudly instead so the gap is visible.
 * Use `log` when the caller needs to await the write (e.g. in scripts).
 */
export class AuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  async log(input: AuditLogInput): Promise<AuditLogRecord> {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        status: input.status ?? AuditStatus.success,
        description: input.description ?? null,
        changes: (input.changes as Prisma.InputJsonValue | undefined) ?? undefined,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, MAX_USER_AGENT) ?? null,
        requestId: input.requestId ?? null,
        requestMethod: input.requestMethod ?? null,
        endpoint: input.endpoint ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  record(input: AuditLogInput): void {
    this.log(input).catch((error: unknown) => {
      this.logger.error('Audit log write failed', {
        action: input.action,
        resourceType: input.resourceType,
        userId: input.userId?.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async query(filter: AuditLogQuery): Promise<{ total: number; logs: AuditLogRecord[] }> {
    const where: Prisma.AuditLogWhereInput = {
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
