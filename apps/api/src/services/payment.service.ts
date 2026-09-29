import Stripe from 'stripe';
import type { PrismaClient } from '@boilerplate/shared-prisma';
import type { Logger } from '@boilerplate/shared-logger';
import type { AuditService } from '@boilerplate/shared-audit';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
import { buildCreditsPurchasedEmail } from '@boilerplate/shared-utils/email-templates';
import type { AppConfig } from '../lib/config.js';
import type { CreditService } from './credit.service.js';
import type { EmailSender } from './email.service.js';

interface PaymentServiceDeps {
  prisma: PrismaClient;
  credits: CreditService;
  email: EmailSender;
  audit: AuditService;
  logger: Logger;
  config: Pick<AppConfig, 'stripe' | 'app'>;
}

/**
 * Credit-pack purchases through Stripe Checkout.
 *
 * The browser is never trusted with the outcome: credits are granted only
 * from the signature-verified webhook, and the grant is keyed on the payment
 * id so Stripe's at-least-once delivery cannot grant twice.
 */
export class PaymentService {
  private readonly stripe?: Stripe;

  constructor(private readonly deps: PaymentServiceDeps) {
    if (deps.config.stripe.secretKey) this.stripe = new Stripe(deps.config.stripe.secretKey);
  }

  get enabled(): boolean {
    return Boolean(this.stripe && this.deps.config.stripe.webhookSecret);
  }

  listPackages() {
    return this.deps.prisma.creditPackage.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { credits: 'asc' }] });
  }

  async createCheckout(userId: bigint, packageId: string, locale: string): Promise<string> {
    if (!this.stripe || !this.enabled) throw new AppError(ERROR_CODES.PAYMENTS_NOT_CONFIGURED);
    const { prisma, config } = this.deps;

    const pkg = await prisma.creditPackage.findFirst({ where: { packageId, isActive: true } });
    if (!pkg) throw AppError.notFound('Credit package');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });

    const billingUrl = `${config.app.webUrl}/${locale}/account/billing`;
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      client_reference_id: userId.toString(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pkg.currency.toLowerCase(),
            unit_amount: Math.round(pkg.price.toNumber() * 100),
            product_data: { name: `${pkg.name} — ${pkg.credits} credits` },
          },
        },
      ],
      metadata: { userId: userId.toString(), packageId: pkg.packageId },
      success_url: `${billingUrl}?checkout=success`,
      cancel_url: `${billingUrl}?checkout=cancelled`,
    });
    if (!session.url) throw new AppError(ERROR_CODES.PAYMENT_FAILED);

    await prisma.payment.create({
      data: {
        userId,
        creditPackageId: pkg.id,
        providerSessionId: session.id,
        credits: pkg.credits,
        amount: pkg.price,
        currency: pkg.currency,
      },
    });
    return session.url;
  }

  /** Verify the Stripe signature over the raw body and dispatch the event. */
  async handleWebhook(rawBody: string, signature: string | undefined): Promise<void> {
    if (!this.stripe || !this.deps.config.stripe.webhookSecret) throw new AppError(ERROR_CODES.PAYMENTS_NOT_CONFIGURED);
    if (!signature) throw AppError.validation('Missing Stripe signature');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.deps.config.stripe.webhookSecret);
    } catch {
      throw AppError.validation('Invalid Stripe signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (event.data.object.payment_status === 'paid') await this.fulfil(event.data.object.id);
        break;
      case 'checkout.session.async_payment_failed':
        await this.markPayment(event.data.object.id, 'failed');
        break;
      case 'checkout.session.expired':
        await this.markPayment(event.data.object.id, 'expired');
        break;
      default:
        this.deps.logger.debug('Ignoring Stripe event', { type: event.type });
    }
  }

  private async fulfil(sessionId: string): Promise<void> {
    const { prisma, credits, email, audit, config, logger } = this.deps;
    const payment = await prisma.payment.findUnique({ where: { providerSessionId: sessionId }, include: { package: true, user: true } });
    if (!payment) {
      logger.warn('Stripe session without a local payment row', { sessionId });
      return;
    }

    const expiresAt = payment.package.validityDays ? new Date(Date.now() + payment.package.validityDays * 86_400_000) : null;
    const grant = await credits.grant({
      userId: payment.userId,
      amount: payment.credits,
      sourceType: 'purchase',
      idempotencyKey: `payment:${payment.id}`,
      expiresAt,
      referenceType: 'payment',
      referenceId: payment.id.toString(),
      description: `${payment.package.name} purchase`,
    });

    // Conditional update: only the first delivery flips the status and emails.
    const { count } = await prisma.payment.updateMany({
      where: { id: payment.id, status: { not: 'succeeded' } },
      data: { status: 'succeeded', completedAt: new Date() },
    });
    if (count === 0 || grant.replayed) return;

    audit.record({
      userId: payment.userId,
      action: 'PURCHASE',
      resourceType: 'Payment',
      resourceId: payment.id.toString(),
      metadata: { credits: payment.credits },
    });
    void email.send(
      payment.user.email,
      buildCreditsPurchasedEmail({
        appName: config.app.name,
        appUrl: config.app.webUrl,
        supportEmail: config.app.supportEmail,
        name: payment.user.name,
        credits: payment.credits,
        amount: payment.amount.toFixed(2),
        currency: payment.currency,
        locale: payment.user.language,
      })
    );
  }

  private async markPayment(sessionId: string, status: 'failed' | 'expired'): Promise<void> {
    await this.deps.prisma.payment.updateMany({ where: { providerSessionId: sessionId, status: 'pending' }, data: { status } });
  }
}
