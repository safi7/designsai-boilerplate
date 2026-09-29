import nodemailer from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
/**
 * Transactional email over one of two transports:
 * - `smtp`: any SMTP server. Locally this is Mailpit (http://localhost:8025).
 * - `ses`:  AWS SES via the SDK, authenticated by the task/pod IAM role.
 *
 * Send failures are returned, not thrown, so callers decide whether a missing
 * email is fatal (an OTP) or best-effort (a welcome note).
 */
export class EmailService {
    config;
    logger;
    smtp;
    ses;
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        if (config.transport === 'ses') {
            this.ses = new SESClient({ region: config.awsRegion });
        }
        else {
            this.smtp = nodemailer.createTransport({
                host: config.smtp.host,
                port: config.smtp.port,
                secure: config.smtp.secure,
                auth: config.smtp.user && config.smtp.password ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
            });
        }
    }
    async send(to, content) {
        try {
            const messageId = this.ses ? await this.sendViaSes(to, content) : await this.sendViaSmtp(to, content);
            this.logger.info('Email sent', { transport: this.config.transport, subject: content.subject, messageId });
            return { success: true, messageId };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error('Email send failed', { transport: this.config.transport, subject: content.subject, error: message });
            return { success: false, error: message };
        }
    }
    async verify() {
        if (this.ses)
            return true;
        try {
            await this.smtp.verify();
            return true;
        }
        catch {
            return false;
        }
    }
    async sendViaSmtp(to, content) {
        const info = await this.smtp.sendMail({ from: this.config.from, to, subject: content.subject, html: content.html, text: content.text });
        return info.messageId;
    }
    async sendViaSes(to, content) {
        const response = await this.ses.send(new SendEmailCommand({
            Source: this.config.from,
            Destination: { ToAddresses: [to] },
            Message: {
                Subject: { Data: content.subject, Charset: 'UTF-8' },
                Body: { Html: { Data: content.html, Charset: 'UTF-8' }, Text: { Data: content.text, Charset: 'UTF-8' } },
            },
        }));
        return response.MessageId ?? '';
    }
}
//# sourceMappingURL=email.service.js.map