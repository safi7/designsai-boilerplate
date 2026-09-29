/**
 * Idempotent reference-data seed: safe to run on every deploy.
 * Usage: yarn workspace @boilerplate/api db:seed
 */
import { createServiceLogger } from '@boilerplate/shared-logger';
import { createPrismaClient, Prisma } from '@boilerplate/shared-prisma';

// Scripts depend on DATABASE_URL only, not on the full API configuration.
const prisma = createPrismaClient(process.env.DATABASE_URL);
const log = createServiceLogger('seed');

export const CREDIT_PACKAGES = [
  { packageId: 'starter', name: 'Starter', credits: 200, price: '4.99', currency: 'USD', validityDays: 365, sortOrder: 1 },
  { packageId: 'pro', name: 'Pro', credits: 1000, price: '19.99', currency: 'USD', validityDays: 365, sortOrder: 2 },
  { packageId: 'team', name: 'Team', credits: 5000, price: '79.99', currency: 'USD', validityDays: null, sortOrder: 3 },
] as const;

async function seedCreditPackages(): Promise<void> {
  for (const pkg of CREDIT_PACKAGES) {
    const data = { ...pkg, price: new Prisma.Decimal(pkg.price) };
    await prisma.creditPackage.upsert({ where: { packageId: pkg.packageId }, update: data, create: data });
  }
  log.info('Seeded credit packages', { count: CREDIT_PACKAGES.length });
}

async function main(): Promise<void> {
  await seedCreditPackages();
}

main()
  .catch(error => {
    log.error('Seed failed', { error: error instanceof Error ? error.stack : String(error) });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
