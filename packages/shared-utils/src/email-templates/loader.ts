import Handlebars from 'handlebars';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'templates');

// A dedicated Handlebars environment so helpers/partials never leak into, or
// collide with, another consumer of the global instance.
const hbs = Handlebars.create();
const cache = new Map<string, Handlebars.TemplateDelegate>();
let partialsRegistered = false;

function registerPartials(): void {
  if (partialsRegistered) return;
  hbs.registerPartial('header', readFileSync(join(TEMPLATES_DIR, 'shared/header.html'), 'utf-8'));
  hbs.registerPartial('footer', readFileSync(join(TEMPLATES_DIR, 'shared/footer.html'), 'utf-8'));
  partialsRegistered = true;
}

function compile(name: string, locale: EmailLocale, ext: 'html' | 'txt'): Handlebars.TemplateDelegate {
  const cacheKey = `${name}:${locale}:${ext}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Fall back to English so a missing translation degrades instead of failing the send.
  const localized = join(TEMPLATES_DIR, name, `${locale}.${ext}`);
  const file = existsSync(localized) ? localized : join(TEMPLATES_DIR, name, `en.${ext}`);
  if (!existsSync(file)) {
    throw new Error(`Email template not found: ${name}/${locale}.${ext} (looked in ${TEMPLATES_DIR})`);
  }

  const template = hbs.compile(readFileSync(file, 'utf-8'), { strict: true });
  cache.set(cacheKey, template);
  return template;
}

/**
 * Render `templates/<name>/<locale>.{html,txt}`. Values are HTML-escaped by
 * Handlebars; `strict` mode turns a missing variable into an error instead of
 * silently rendering an empty string into a customer's inbox.
 */
export function renderEmail(
  name: string,
  locale: EmailLocale,
  subject: string,
  variables: BrandingVariables & Record<string, unknown>
): EmailContent {
  registerPartials();
  const data = { year: new Date().getFullYear(), ...variables, supportEmail: variables.supportEmail ?? '' };
  return {
    subject,
    html: compile(name, locale, 'html')(data),
    text: compile(name, locale, 'txt')(data),
  };
}
