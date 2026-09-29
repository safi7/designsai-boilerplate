import type { EmailLocale } from './strings.js';
export interface EmailContent {
    subject: string;
    html: string;
    text: string;
}
export interface BrandingVariables {
    appName: string;
    appUrl: string;
    supportEmail?: string;
}
/**
 * Render `templates/<name>/<locale>.{html,txt}`. Values are HTML-escaped by
 * Handlebars; `strict` mode turns a missing variable into an error instead of
 * silently rendering an empty string into a customer's inbox.
 */
export declare function renderEmail(name: string, locale: EmailLocale, subject: string, variables: BrandingVariables & Record<string, unknown>): EmailContent;
//# sourceMappingURL=loader.d.ts.map