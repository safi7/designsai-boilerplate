import { swaggerUI } from '@hono/swagger-ui';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { createRouter } from './lib/openapi-hono.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import { createHealthRoutes } from './routes/health.js';
import { createAgentRoutes } from './routes/v1/agents.js';
import { createAuthRoutes } from './routes/v1/auth.js';
import { createCreditRoutes } from './routes/v1/credits.js';
import { createUserRoutes } from './routes/v1/users.js';
import { createWebhookRoutes } from './routes/v1/webhooks.js';
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
/**
 * Builds the HTTP application from a container. Kept separate from the
 * server bootstrap (index.ts) so tests can exercise the full middleware stack
 * with `app.request()` and no open port.
 */
export function createApp(container) {
    const { config } = container;
    const app = createRouter();
    // Order matters: id → log → headers → CORS/CSRF → body limits → identity.
    app.use('*', requestId());
    app.use('*', requestLogger());
    app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-site' }));
    app.use('*', cors({ origin: config.cors.origins, credentials: true, exposeHeaders: ['x-request-id', 'retry-after'], maxAge: 600 }));
    // Rejects cross-origin form posts (the classic CSRF vector for cookie auth).
    app.use('*', csrf({ origin: config.cors.origins }));
    app.use('/v1/users/me/avatar', bodyLimit({ maxSize: MAX_UPLOAD_BYTES, onError: () => { throw new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE); } }));
    app.use('/v1/*', async (c, next) => {
        if (c.req.path === '/v1/users/me/avatar')
            return next();
        return bodyLimit({ maxSize: MAX_JSON_BODY_BYTES, onError: () => { throw new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE); } })(c, next);
    });
    app.use('/v1/*', authenticate({ sessions: container.sessions, jwtSecret: config.auth.jwtSecret, cookieName: config.auth.cookieName, cookieDomain: config.auth.cookieDomain }));
    app.route('/', createHealthRoutes(container));
    app.route('/v1/auth', createAuthRoutes(container));
    app.route('/v1/users', createUserRoutes(container));
    app.route('/v1/credits', createCreditRoutes(container));
    app.route('/v1/agents', createAgentRoutes(container));
    app.route('/v1/webhooks', createWebhookRoutes(container));
    app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', { type: 'apiKey', in: 'cookie', name: config.auth.cookieName });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    app.doc31('/doc/openapi.json', {
        openapi: '3.1.0',
        info: { title: `${config.app.name} API`, version: process.env.APP_VERSION ?? '0.1.0' },
        servers: [{ url: config.app.apiUrl }],
    });
    if (config.docsEnabled)
        app.get('/doc', swaggerUI({ url: '/doc/openapi.json' }));
    app.notFound(notFoundHandler);
    app.onError(errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map