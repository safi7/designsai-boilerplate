/**
 * Operator tool: grant credits to a user (support, testing, promotions).
 *
 *   yarn workspace @boilerplate/api credits:grant --email jane@example.com --amount 100 [--reason "Support goodwill"]
 *
 * Each invocation uses a fresh idempotency key, so it is intentionally NOT
 * safe to re-run blindly; pass --key to make a grant repeatable.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { AuditService } from '@boilerplate/shared-audit';
import { createServiceLogger } from '@boilerplate/shared-logger';
import { createPrismaClient } from '@boilerplate/shared-prisma';
import { CreditService } from '../services/credit.service.js';

// Scripts depend on DATABASE_URL only, not on the full API configuration.
const prisma = createPrismaClient(process.env.DATABASE_URL);
const log = createServiceLogger('credits-cli');
const auditService = new AuditService(prisma, log);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, amount: { type: 'string' }, reason: { type: 'string' }, key: { type: 'string' } },
  });
  if (!values.email || !values.amount || Number.isNaN(Number(values.amount))) {
    throw new Error('Usage: credits:grant --email <email> --amount <number> [--reason <text>] [--key <idempotency key>]');
  }

  const user = await prisma.user.findUnique({ where: { email: values.email.toLowerCase() } });
  if (!user) throw new Error(`No user with email ${values.email}`);

  const credits = new CreditService(prisma, log);
  const result = await credits.grant({
    userId: user.id,
    amount: values.amount,
    sourceType: 'manual_adjustment',
    idempotencyKey: values.key ?? `manual:${randomUUID()}`,
    description: values.reason ?? 'Manual adjustment',
  });
  await auditService.log({
    userId: user.id,
    action: 'CREATE',
    resourceType: 'CreditTransaction',
    resourceId: result.transactionId.toString(),
    description: `Manual grant of ${values.amount} credits via CLI`,
  });

  log.info('Credits granted', {
    email: user.email,
    amount: result.amount.toString(),
    balance: result.balanceAfter.toString(),
    replayed: result.replayed,
  });
}

main()
  .catch(error => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
