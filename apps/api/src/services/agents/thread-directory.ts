import type { AgentThread, AgentThreadStatus, Prisma, PrismaClient } from '@boilerplate/shared-prisma';
import type { AgentThread as AgentThreadDto } from '@boilerplate/shared-schemas';
import { AppError } from '@boilerplate/shared-utils';

export const DEFAULT_THREAD_TITLE = 'New chat';

/** Keyset cursor over (lastMessageAt desc, id desc): stable under concurrent inserts, unlike OFFSET. */
function encodeCursor(thread: Pick<AgentThread, 'lastMessageAt' | 'id'>): string {
  return Buffer.from(`${thread.lastMessageAt.getTime()}:${thread.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  const [ms, id] = Buffer.from(cursor, 'base64url').toString().split(':');
  const at = Number(ms);
  return Number.isFinite(at) && id ? { at: new Date(at), id } : null;
}

export function toThreadDto(thread: AgentThread): AgentThreadDto {
  return {
    id: thread.id,
    domain: thread.domain,
    title: thread.title,
    status: thread.status,
    isFavorite: thread.isFavorite,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    createdAt: thread.createdAt.toISOString(),
  };
}

/**
 * Domain-agnostic thread directory: the sidebar, search, favourites and
 * ownership checks. Domains (Ask AI today) keep their own state keyed by the
 * thread id, so adding a new agent domain never touches this module.
 */
export class ThreadDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  /** Ownership check folded into the lookup: another user's thread is simply "not found". */
  async getOwned(userId: bigint, threadId: string): Promise<AgentThread> {
    const thread = await this.prisma.agentThread.findFirst({ where: { id: threadId, userId, isDeleted: false } });
    if (!thread) throw AppError.notFound('Thread');
    return thread;
  }

  async list(userId: bigint, options: { cursor?: string; limit: number; search?: string; favorites?: boolean }) {
    const cursor = options.cursor ? decodeCursor(options.cursor) : null;
    const where: Prisma.AgentThreadWhereInput = {
      userId,
      isDeleted: false,
      ...(options.favorites ? { isFavorite: true } : {}),
      ...(options.search ? { title: { contains: options.search } } : {}),
      ...(cursor ? { OR: [{ lastMessageAt: { lt: cursor.at } }, { lastMessageAt: cursor.at, id: { lt: cursor.id } }] } : {}),
    };
    const rows = await this.prisma.agentThread.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
    });
    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]!) : null, hasMore };
  }

  async update(userId: bigint, threadId: string, patch: { title?: string; isFavorite?: boolean }): Promise<AgentThread> {
    await this.getOwned(userId, threadId);
    return this.prisma.agentThread.update({ where: { id: threadId }, data: patch });
  }

  async softDelete(userId: bigint, threadId: string): Promise<void> {
    await this.getOwned(userId, threadId);
    await this.prisma.agentThread.update({ where: { id: threadId }, data: { isDeleted: true, deletedAt: new Date() } });
  }

  async setStatus(threadId: string, status: AgentThreadStatus, touchLastMessage = false): Promise<void> {
    await this.prisma.agentThread.update({
      where: { id: threadId },
      data: { status, ...(touchLastMessage ? { lastMessageAt: new Date() } : {}) },
    });
  }
}
