import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@boilerplate/shared-prisma';
import { ERROR_CODES } from '@boilerplate/shared-utils';
import { createSilentLogger } from '../test/fakes.js';
import { CreditService } from './credit.service.js';

/**
 * Runs against a real, migrated MySQL (row locks and unique indexes are the
 * point of these tests; a mock would prove nothing). Enabled when
 * TEST_DATABASE_URL is set — CI provides one, locally: `make test-integration`.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('CreditService (MySQL)', () => {
  let prisma: PrismaClient;
  let credits: CreditService;
  let userId: bigint;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    credits = new CreditService(prisma, createSilentLogger());
    const user = await prisma.user.create({
      data: { email: `ledger-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, name: 'Ledger', status: 'active' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('grants are idempotent per key', async () => {
    const first = await credits.grant({ userId, amount: 10, sourceType: 'promotional', idempotencyKey: `grant:${userId}:a` });
    const again = await credits.grant({ userId, amount: 10, sourceType: 'promotional', idempotencyKey: `grant:${userId}:a` });
    expect(again.replayed).toBe(true);
    expect(again.transactionId).toBe(first.transactionId);
    expect((await credits.getBalance(userId)).balance.toString()).toBe('10');
  });

  it('spends the soonest-expiring credits first', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    await credits.grant({ userId, amount: 5, sourceType: 'signup_bonus', idempotencyKey: `grant:${userId}:soon`, expiresAt: soon });
    await credits.debit({ userId, amount: 3, idempotencyKey: `debit:${userId}:1`, feature: 'test' });

    const expiring = await prisma.creditSource.findFirstOrThrow({ where: { userId, sourceType: 'signup_bonus' } });
    expect(expiring.remaining.toString()).toBe('2');
    expect((await credits.getBalance(userId)).balance.toString()).toBe('12');
  });

  it('refuses to overdraw unless partial charging is allowed', async () => {
    await expect(credits.debit({ userId, amount: 1000, idempotencyKey: `debit:${userId}:big`, feature: 'test' })).rejects.toMatchObject({
      code: ERROR_CODES.INSUFFICIENT_CREDITS,
    });
    const partial = await credits.debit({ userId, amount: 1000, idempotencyKey: `debit:${userId}:partial`, feature: 'test', allowPartial: true });
    expect(partial.amount.toString()).toBe('12');
    expect(partial.shortfall.toString()).toBe('988');
    expect(partial.balanceAfter.toString()).toBe('0');
  });

  it('serialises concurrent debits so the balance never goes negative', async () => {
    await credits.grant({ userId, amount: 5, sourceType: 'promotional', idempotencyKey: `grant:${userId}:race` });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => credits.debit({ userId, amount: 1, idempotencyKey: `debit:${userId}:race:${i}`, feature: 'test' }))
    );
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5);
    expect((await credits.getBalance(userId)).balance.toString()).toBe('0');
  });
});
