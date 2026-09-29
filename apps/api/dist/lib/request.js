import { getConnInfo } from '@hono/node-server/conninfo';
/**
 * Client IP. Behind a load balancer the left-most X-Forwarded-For entry is the
 * original client; locally we fall back to the socket address.
 */
export function getClientIp(c) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded)
        return forwarded.split(',')[0].trim();
    const realIp = c.req.header('x-real-ip');
    if (realIp)
        return realIp.trim();
    try {
        return getConnInfo(c).remote.address ?? 'unknown';
    }
    catch {
        return 'unknown';
    }
}
export function getUserAgent(c) {
    return c.req.header('user-agent')?.slice(0, 500);
}
/** Drop the last IPv4 octet / IPv6 groups before an address reaches the logs. */
export function anonymizeIp(ip) {
    if (ip.includes('.'))
        return ip.replace(/\.\d+$/, '.0');
    if (ip.includes(':'))
        return ip.split(':').slice(0, 3).join(':') + '::';
    return ip;
}
export function requestMeta(c) {
    return {
        ipAddress: getClientIp(c),
        userAgent: getUserAgent(c) ?? null,
        requestId: c.get('requestId') ?? null,
        requestMethod: c.req.method,
        endpoint: c.req.path,
    };
}
//# sourceMappingURL=request.js.map