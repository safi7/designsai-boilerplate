import { Hono } from 'hono';
import type { Container } from '../../container.js';
import type { AppEnv } from '../../types/hono.js';

/**
 * Third-party webhooks. Plain Hono (not OpenAPI) because the handler needs
 * the raw, unparsed body to verify the provider's signature.
 */
export function createWebhookRoutes(container: Container) {
  const router = new Hono<AppEnv>();

  router.post('/stripe', async c => {
    const rawBody = await c.req.text();
    await container.payments.handleWebhook(rawBody, c.req.header('stripe-signature'));
    return c.json({ received: true });
  });

  return router;
}
