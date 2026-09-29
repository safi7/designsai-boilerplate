#!/usr/bin/env node
// tsc only emits .js/.d.ts; the Handlebars sources must be copied next to the
// compiled loader so it can resolve them relative to import.meta.url.
import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
cpSync(join(root, 'src/email-templates/templates'), join(root, 'dist/email-templates/templates'), { recursive: true, force: true });
console.log('✓ email templates copied');
