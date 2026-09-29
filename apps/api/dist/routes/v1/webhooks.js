import { Hono } from 'hono';
/**
 * Third-party webhooks. Plain Hono (not OpenAPI) because the handler needs
 * the raw, unparsed body to verify the provider's signature.
 */
export function createWebhookRoutes(container) {
    const router = new Hono();
    router.post('/stripe', async (c) => {
        const rawBody = await c.req.text();
        await container.payments.handleWebhook(rawBody, c.req.header('stripe-signature'));
        return c.json({ received: true });
    });
    return router;
}
//# sourceMappingURL=webhooks.js.map