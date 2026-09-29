import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Minimal example tool. Models have no clock, so questions like "what day is
 * it?" or "how long until Friday?" need one. New tools follow the same shape:
 * a zod input schema, a zod output schema, and a pure `execute`.
 */
export const currentTimeTool = createTool({
  id: 'current_time',
  description: "Returns the current date and time. Use it whenever the answer depends on today's date or the current time.",
  inputSchema: z.object({
    timeZone: z.string().describe('IANA time zone, e.g. "Europe/Madrid". Defaults to UTC.').optional(),
  }),
  outputSchema: z.object({ iso: z.string(), formatted: z.string(), timeZone: z.string() }),
  execute: async input => {
    const now = new Date();
    let timeZone = input.timeZone ?? 'UTC';
    let formatted: string;
    try {
      formatted = now.toLocaleString('en-US', { timeZone, dateStyle: 'full', timeStyle: 'long' });
    } catch {
      timeZone = 'UTC';
      formatted = now.toLocaleString('en-US', { timeZone, dateStyle: 'full', timeStyle: 'long' });
    }
    return { iso: now.toISOString(), formatted, timeZone };
  },
});
