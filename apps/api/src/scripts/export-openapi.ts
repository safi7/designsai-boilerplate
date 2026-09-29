/**
 * Writes the OpenAPI document to disk without starting the server or touching
 * any database, so the web client can be regenerated in CI.
 *
 *   yarn workspace @boilerplate/api openapi:export [output-path]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Placeholders only: nothing below connects (Redis/Prisma are lazy).
process.env.DATABASE_URL ??= 'mysql://openapi:openapi@localhost:3306/openapi';
process.env.JWT_SECRET ??= 'openapi-export-placeholder-secret-32chars!!';
process.env.API_TO_AGENTS_INTERNAL_TOKEN ??= 'openapi-export-placeholder-token-32chars!!';
process.env.LOG_LEVEL ??= 'error';

const { createApp } = await import('../app.js');
const { container } = await import('../container.js');

const output = resolve(process.argv[2] ?? new URL('../../openapi.json', import.meta.url).pathname);
const app = createApp(container);
const document = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: { title: `${container.config.app.name} API`, version: process.env.APP_VERSION ?? '0.1.0' },
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
console.warn(`OpenAPI document written to ${output}`);
process.exit(0);
