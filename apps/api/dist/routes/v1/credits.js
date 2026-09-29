import { createRoute, z } from '@hono/zod-openapi';
import { CheckoutRequestSchema, CheckoutResponseSchema, CreditBalanceResponseSchema, CreditPackageListResponseSchema, CreditTransactionListResponseSchema, CursorPaginationQuerySchema, LocaleSchema, } from '@boilerplate/shared-schemas';
import { createRouter } from '../../lib/openapi-hono.js';
import { getAuth, requireAuth } from '../../middleware/auth.js';
import { cookieAuth, errorResponses, jsonBody, jsonContent } from '../openapi-helpers.js';
const tags = ['Credits'];
export function createCreditRoutes(container) {
    const { credits, payments, users } = container;
    const router = createRouter();
    router.use('*', requireAuth);
    router.openapi(createRoute({
        method: 'get',
        path: '/balance',
        tags,
        summary: 'Spendable credit balance',
        security: cookieAuth,
        responses: { 200: jsonContent(CreditBalanceResponseSchema, 'Balance'), ...errorResponses(401) },
    }), async (c) => {
        const { balance, nextExpiry } = await credits.getBalance(getAuth(c).userId);
        return c.json({
            balance: balance.toFixed(2),
            nextExpiry: nextExpiry ? { amount: nextExpiry.amount.toFixed(2), expiresAt: nextExpiry.expiresAt.toISOString() } : null,
        }, 200);
    });
    router.openapi(createRoute({
        method: 'get',
        path: '/transactions',
        tags,
        summary: 'Ledger history, newest first',
        security: cookieAuth,
        request: { query: CursorPaginationQuerySchema },
        responses: { 200: jsonContent(CreditTransactionListResponseSchema, 'Transactions'), ...errorResponses(401) },
    }), async (c) => {
        const { cursor, limit } = c.req.valid('query');
        const page = await credits.listTransactions(getAuth(c).userId, { cursor, limit });
        return c.json({
            items: page.items.map(t => ({
                id: t.id.toString(),
                type: t.type,
                amount: t.amount.toFixed(2),
                balanceAfter: t.balanceAfter.toFixed(2),
                description: t.description,
                referenceType: t.referenceType,
                referenceId: t.referenceId,
                createdAt: t.createdAt.toISOString(),
            })),
            pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        }, 200);
    });
    router.openapi(createRoute({
        method: 'get',
        path: '/packages',
        tags,
        summary: 'Purchasable credit packs',
        security: cookieAuth,
        responses: { 200: jsonContent(CreditPackageListResponseSchema, 'Packages'), ...errorResponses(401) },
    }), async (c) => {
        const packages = await payments.listPackages();
        return c.json({
            checkoutEnabled: payments.enabled,
            packages: packages.map(p => ({
                packageId: p.packageId,
                name: p.name,
                credits: p.credits,
                price: p.price.toFixed(2),
                currency: p.currency,
                validityDays: p.validityDays,
            })),
        }, 200);
    });
    router.openapi(createRoute({
        method: 'post',
        path: '/checkout',
        tags,
        summary: 'Start a Stripe Checkout for a credit pack',
        security: cookieAuth,
        request: { ...jsonBody(CheckoutRequestSchema), query: z.object({ locale: LocaleSchema.optional() }) },
        responses: { 200: jsonContent(CheckoutResponseSchema, 'Redirect the browser to checkoutUrl'), ...errorResponses(400, 401, 404, 501) },
    }), async (c) => {
        const { userId } = getAuth(c);
        const user = await users.getById(userId);
        const locale = c.req.valid('query').locale ?? (user.language === 'es' ? 'es' : 'en');
        const checkoutUrl = await payments.createCheckout(userId, c.req.valid('json').packageId, locale);
        return c.json({ checkoutUrl }, 200);
    });
    return router;
}
//# sourceMappingURL=credits.js.map