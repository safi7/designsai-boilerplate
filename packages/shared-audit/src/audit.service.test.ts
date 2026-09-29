import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@boilerplate/shared-logger';
import type { PrismaClient } from '@boilerplate/shared-prisma';
import { AuditService } from './audit.service.js';

function setup(create = vi.fn(async (args: unknown) => args)) {
  const prisma = { auditLog: { create } } as unknown as PrismaClient;
  const logger = { error: vi.fn() } as unknown as Logger;
  return { service: new AuditService(prisma, logger), create, logger };
}

describe('AuditService', () => {
  it('defaults status to success and truncates long user agents', async () => {
    const { service, create } = setup();
    await service.log({ action: 'LOGIN', resourceType: 'Session', userAgent: 'x'.repeat(600) });
    const data = (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('success');
    expect((data.userAgent as string).length).toBe(500);
  });

  it('record() never throws when the write fails', async () => {
    const { service, logger } = setup(vi.fn().mockRejectedValue(new Error('db down')));
    expect(() => service.record({ action: 'LOGIN', resourceType: 'Session' })).not.toThrow();
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
  });
});
