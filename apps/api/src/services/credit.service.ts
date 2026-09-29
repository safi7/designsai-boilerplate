import { Prisma, type CreditSourceType, type PrismaClient } from '@boilerplate/shared-prisma';
import type { Logger } from '@boilerplate/shared-logger';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { isUniqueViolation } from '../lib/prisma-errors.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;
type DecimalValue = Prisma.Decimal.Value;
type Tx = Prisma.TransactionClient;

const SCALE = 6;
export const toCredits = (value: DecimalValue): Decimal => new Decimal(value).toDecimalPlaces(SCALE, Decimal.ROUND_HALF_UP);

export interface GrantInput {
  userId: bigint;
  amount: DecimalValue;
  sourceType: CreditSourceType;
  /** Required: a retried grant with the same key is a no-op. */
  idempotencyKey: string;
  expiresAt?: Date | null;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

export interface DebitInput {
  userId: bigint;
  amount: DecimalValue;
  idempotencyKey: string;
  feature: string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  usage?: { provider?: string; model?: string; inputTokens?: number; outputTokens?: number; threadId?: string };
  /**
   * Charge whatever is available instead of refusing. Used for work that has
   * already been delivered (a finished chat turn): we cannot un-send tokens,
   * so we record the shortfall instead of losing the whole charge.
   */
  allowPartial?: boolean;
}

export interface LedgerResult {
  transactionId: bigint;
  amount: Decimal;
  balanceAfter: Decimal;
  /** True when the idempotency key had already been applied. */
  replayed: boolean;
}

export interface DebitResult extends LedgerResult {
  shortfall: Decimal;
}

/**
 * The credit ledger.
 *
 * Invariants:
 * 1. Every mutation runs in one transaction that first locks the user row, so
 *    concurrent grants/debits for the same user are serialised (no lost
 *    updates, no negative balances).
 * 2. Every mutation carries an idempotency key backed by a UNIQUE index, so
 *    retries (webhooks, queue redeliveries, client retries) apply at most once.
 * 3. Debits draw from the soonest-expiring source first; each draw is
 *    recorded in `credit_transaction_sources` for a full audit trail.
 */
export class CreditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger
  ) {}

  async getBalance(userId: bigint): Promise<{ balance: Decimal; nextExpiry: { amount: Decimal; expiresAt: Date } | null }> {
    const [balance, next] = await Promise.all([
      this.sumAvailable(this.prisma, userId),
      this.prisma.creditSource.findFirst({
        where: { ...this.availableWhere(userId), expiresAt: { not: null, gt: new Date() } },
        orderBy: { expiresAt: 'asc' },
        select: { remaining: true, expiresAt: true },
      }),
    ]);
    return { balance, nextExpiry: next?.expiresAt ? { amount: next.remaining, expiresAt: next.expiresAt } : null };
  }

  async hasAtLeast(userId: bigint, amount: DecimalValue): Promise<boolean> {
    return (await this.sumAvailable(this.prisma, userId)).gte(toCredits(amount));
  }

  async grant(input: GrantInput): Promise<LedgerResult> {
    const amount = toCredits(input.amount);
    if (amount.lte(0)) throw AppError.validation('Grant amount must be positive');

    return this.withIdempotency(input.idempotencyKey, async tx => {
      await this.lockUser(tx, input.userId);
      const before = await this.sumAvailable(tx, input.userId);
      const after = before.plus(amount);

      const source = await tx.creditSource.create({
        data: {
          userId: input.userId,
          sourceType: input.sourceType,
          totalAllocated: amount,
          remaining: amount,
          expiresAt: input.expiresAt ?? null,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        },
      });
      const transaction = await tx.creditTransaction.create({
        data: {
          userId: input.userId,
          type: input.sourceType === 'refund' ? 'refund' : 'grant',
          amount,
          balanceBefore: before,
          balanceAfter: after,
          idempotencyKey: input.idempotencyKey,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          description: input.description,
          allocations: { create: { creditSourceId: source.id, amount } },
        },
      });

      this.logger.info('Credits granted', { userId: input.userId.toString(), amount: amount.toString(), sourceType: input.sourceType });
      return { transactionId: transaction.id, amount, balanceAfter: after, replayed: false };
    });
  }

  async debit(input: DebitInput): Promise<DebitResult> {
    const requested = toCredits(input.amount);
    if (requested.lt(0)) throw AppError.validation('Debit amount must not be negative');

    return this.withIdempotency(input.idempotencyKey, async tx => {
      await this.lockUser(tx, input.userId);
      const sources = await tx.creditSource.findMany({
        where: this.availableWhere(input.userId),
        // Soonest expiry first; non-expiring credits are spent last.
        orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        select: { id: true, remaining: true },
      });
      const before = sources.reduce((sum, s) => sum.plus(s.remaining), new Decimal(0));

      if (before.lt(requested) && !input.allowPartial) {
        throw new AppError(ERROR_CODES.INSUFFICIENT_CREDITS, { details: { balance: before.toString(), required: requested.toString() } });
      }

      const charged = Decimal.min(requested, before);
      const allocations: { creditSourceId: bigint; amount: Decimal }[] = [];
      let outstanding = charged;
      for (const source of sources) {
        if (outstanding.lte(0)) break;
        const draw = Decimal.min(outstanding, source.remaining);
        await tx.creditSource.update({ where: { id: source.id }, data: { remaining: { decrement: draw } } });
        allocations.push({ creditSourceId: source.id, amount: draw });
        outstanding = outstanding.minus(draw);
      }

      const shortfall = requested.minus(charged);
      const after = before.minus(charged);
      const transaction = await tx.creditTransaction.create({
        data: {
          userId: input.userId,
          type: 'usage',
          amount: charged,
          balanceBefore: before,
          balanceAfter: after,
          idempotencyKey: input.idempotencyKey,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          description: input.description,
          metadata: shortfall.gt(0) ? { requested: requested.toString(), shortfall: shortfall.toString() } : undefined,
          allocations: { create: allocations },
          usageLog: {
            create: {
              userId: input.userId,
              feature: input.feature,
              amount: charged,
              provider: input.usage?.provider,
              model: input.usage?.model,
              inputTokens: input.usage?.inputTokens ?? 0,
              outputTokens: input.usage?.outputTokens ?? 0,
              threadId: input.usage?.threadId,
            },
          },
        },
      });

      if (shortfall.gt(0)) {
        this.logger.warn('Debit short of requested amount', {
          userId: input.userId.toString(),
          requested: requested.toString(),
          shortfall: shortfall.toString(),
        });
      }
      return { transactionId: transaction.id, amount: charged, balanceAfter: after, shortfall, replayed: false };
    });
  }

  async listTransactions(userId: bigint, options: { cursor?: string; limit: number }) {
    const cursorId = options.cursor && /^\d+$/.test(options.cursor) ? BigInt(options.cursor) : undefined;
    const rows = await this.prisma.creditTransaction.findMany({
      where: { userId, ...(cursorId ? { id: { lt: cursorId } } : {}) },
      orderBy: { id: 'desc' },
      take: options.limit + 1,
    });
    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id.toString() : null, hasMore };
  }

  private availableWhere(userId: bigint): Prisma.CreditSourceWhereInput {
    return { userId, isActive: true, remaining: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
  }

  private async sumAvailable(client: Tx | PrismaClient, userId: bigint): Promise<Decimal> {
    const result = await client.creditSource.aggregate({ where: this.availableWhere(userId), _sum: { remaining: true } });
    return result._sum.remaining ?? new Decimal(0);
  }

  /** Row lock on the user: the serialisation point for that user's ledger. */
  private async lockUser(tx: Tx, userId: bigint): Promise<void> {
    const rows = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (rows.length === 0) throw AppError.notFound('User');
  }

  private async withIdempotency<T extends LedgerResult>(key: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    const replay = async (): Promise<T | null> => {
      const existing = await this.prisma.creditTransaction.findUnique({ where: { idempotencyKey: key } });
      if (!existing) return null;
      const shortfall = new Decimal(((existing.metadata as { shortfall?: string } | null)?.shortfall ?? '0') as string);
      return { transactionId: existing.id, amount: existing.amount, balanceAfter: existing.balanceAfter, shortfall, replayed: true } as unknown as T;
    };

    const prior = await replay();
    if (prior) return prior;
    try {
      return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 });
    } catch (error) {
      // Lost a race to a concurrent request with the same key: return its result.
      if (isUniqueViolation(error)) {
        const winner = await replay();
        if (winner) return winner;
      }
      throw error;
    }
  }
}
