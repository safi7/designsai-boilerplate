import { Hono } from 'hono';
import { checkRedisHealth } from '@boilerplate/shared-cache';
import type { Container } from '../container.js';
import type { AppEnv } from '../types/hono.js';

type CheckResult = { status: 'up' | 'down'; latencyMs: number; error?: string };

async function timed(check: () => Promise<unknown>): Promise<CheckResult> {
  const start = performance.now();
  try {
    await check();
    return { status: 'up', latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return { status: 'down', latencyMs: Math.round(performance.now() - start), error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * `/health/live`  — process is up (liveness probe; never touches dependencies).
 * `/health/ready` — MySQL and Redis reachable (readiness probe; gates traffic).
 * `/health`       — full report incl. storage, email and agents (dashboards).
 */
export function createHealthRoutes(container: Container) {
  const router = new Hono<AppEnv>();
  const version = process.env.APP_VERSION ?? '0.1.0';

  router.get('/health/live', c => c.json({ status: 'ok' }));

  router.get('/health/ready', async c => {
    const [database, redis] = await Promise.all([
      timed(() => container.prisma.$queryRaw`SELECT 1`),
      timed(() => checkRedisHealth(container.redis, 'api')),
    ]);
    const ready = database.status === 'up' && redis.status === 'up';
    return c.json({ status: ready ? 'ready' : 'not_ready', checks: { database, redis } }, ready ? 200 : 503);
  });

  router.get('/health', async c => {
    const [database, redis, storage, email, agents] = await Promise.all([
      timed(() => container.prisma.$queryRaw`SELECT 1`),
      timed(() => checkRedisHealth(container.redis, 'api')),
      timed(() => container.storage.list({ maxKeys: 1 })),
      timed(async () => {
        if (!(await container.email.verify())) throw new Error('Email transport unreachable');
      }),
      timed(async () => {
        if (!(await container.agents.health())) throw new Error('Agents service unreachable');
      }),
    ]);
    const critical = database.status === 'up' && redis.status === 'up';
    const degraded = [storage, email, agents].some(check => check.status === 'down');
    return c.json(
      {
        status: !critical ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
        version,
        uptimeSeconds: Math.round(process.uptime()),
        checks: { database, redis, storage, email, agents },
      },
      critical ? 200 : 503
    );
  });

  return router;
}
