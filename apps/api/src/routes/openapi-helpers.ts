import type { ZodTypeAny } from 'zod';
import { ErrorResponseSchema } from '@boilerplate/shared-schemas';

export const jsonContent = <T extends ZodTypeAny>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});

export const jsonBody = <T extends ZodTypeAny>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Invalid request',
  401: 'Not authenticated',
  402: 'Insufficient credits',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  429: 'Rate limited',
  501: 'Not configured',
  503: 'Dependency unavailable',
};

/** Documents the standard error envelope for the listed status codes. */
export function errorResponses(...statuses: (keyof typeof ERROR_DESCRIPTIONS)[]) {
  return Object.fromEntries(statuses.map(status => [status, jsonContent(ErrorResponseSchema, ERROR_DESCRIPTIONS[status]!)]));
}

export const cookieAuth: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];
