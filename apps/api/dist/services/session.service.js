import { randomUUID } from 'node:crypto';
const SESSION_KEY = (jti) => `session:${jti}`;
const TOUCH_KEY = (jti) => `session-touch:${jti}`;
/** `last_used_at` is informational; write it at most this often per session. */
const TOUCH_INTERVAL_SECONDS = 10 * 60;
/**
 * Server-side sessions behind stateless JWTs.
 *
 * MySQL `user_sessions` is the source of truth; Redis caches "this jti is
 * valid for this user" so the auth middleware does not hit the database on
 * every request. Deleting the row (logout, password reset, "sign out other
 * devices") revokes the JWT immediately even though it has not expired.
 */
export class SessionService {
    prisma;
    redis;
    logger;
    ttlSeconds;
    constructor(prisma, redis, logger, ttlSeconds) {
        this.prisma = prisma;
        this.redis = redis;
        this.logger = logger;
        this.ttlSeconds = ttlSeconds;
    }
    async create(userId, meta = {}) {
        const jti = randomUUID();
        const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
        await this.prisma.userSession.create({
            data: { userId, jti, expiresAt, userAgent: meta.userAgent ?? null, ipAddress: meta.ipAddress ?? null },
        });
        await this.cache(jti, userId, this.ttlSeconds);
        // Opportunistic housekeeping; never blocks sign-in.
        this.prisma.userSession.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } }).catch(error => {
            this.logger.warn('Expired session cleanup failed', { error: error instanceof Error ? error.message : String(error) });
        });
        return { jti, expiresAt };
    }
    /** Redis fast path; on a miss, fall back to MySQL and re-warm the cache. */
    async validate(jti, userId) {
        try {
            const cached = await this.redis.get(SESSION_KEY(jti));
            if (cached !== null)
                return cached === userId.toString();
        }
        catch (error) {
            this.logger.warn('Session cache unavailable, falling back to database', { error: error instanceof Error ? error.message : String(error) });
        }
        const row = await this.prisma.userSession.findUnique({ where: { jti }, select: { userId: true, expiresAt: true } });
        if (!row || row.userId !== userId)
            return false;
        const remaining = Math.floor((row.expiresAt.getTime() - Date.now()) / 1000);
        if (remaining <= 0) {
            await this.prisma.userSession.deleteMany({ where: { jti } });
            return false;
        }
        await this.cache(jti, userId, remaining);
        return true;
    }
    /** Throttled `last_used_at` update, fire-and-forget. */
    touch(jti) {
        this.redis
            .set(TOUCH_KEY(jti), '1', 'EX', TOUCH_INTERVAL_SECONDS, 'NX')
            .then(acquired => (acquired ? this.prisma.userSession.updateMany({ where: { jti }, data: { lastUsedAt: new Date() } }) : null))
            .catch(() => undefined);
    }
    async destroy(jti) {
        await this.prisma.userSession.deleteMany({ where: { jti } });
        await this.redis.del(SESSION_KEY(jti)).catch(() => undefined);
    }
    /** Revoke every session of a user, optionally keeping the caller's own. */
    async destroyAll(userId, exceptJti) {
        const sessions = await this.prisma.userSession.findMany({
            where: { userId, ...(exceptJti ? { jti: { not: exceptJti } } : {}) },
            select: { jti: true },
        });
        if (sessions.length === 0)
            return 0;
        await this.prisma.userSession.deleteMany({ where: { jti: { in: sessions.map(s => s.jti) } } });
        // One DEL per key: a multi-key DEL is CROSSSLOT on Redis Cluster.
        await Promise.all(sessions.map(s => this.redis.del(SESSION_KEY(s.jti)).catch(() => undefined)));
        this.logger.info('Sessions revoked', { userId: userId.toString(), count: sessions.length });
        return sessions.length;
    }
    async list(userId) {
        const rows = await this.prisma.userSession.findMany({
            where: { userId, expiresAt: { gt: new Date() } },
            orderBy: { lastUsedAt: 'desc' },
        });
        return rows.map(r => ({
            id: r.id.toString(),
            jti: r.jti,
            userAgent: r.userAgent,
            ipAddress: r.ipAddress,
            createdAt: r.createdAt,
            lastUsedAt: r.lastUsedAt,
            expiresAt: r.expiresAt,
        }));
    }
    async destroyById(userId, sessionId) {
        const row = await this.prisma.userSession.findFirst({ where: { id: sessionId, userId }, select: { jti: true } });
        if (!row)
            return false;
        await this.destroy(row.jti);
        return true;
    }
    async cache(jti, userId, ttlSeconds) {
        await this.redis.setex(SESSION_KEY(jti), ttlSeconds, userId.toString()).catch(error => {
            this.logger.warn('Failed to cache session', { error: error instanceof Error ? error.message : String(error) });
        });
    }
}
//# sourceMappingURL=session.service.js.map