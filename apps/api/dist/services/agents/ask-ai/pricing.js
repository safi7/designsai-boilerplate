import { Prisma } from '@boilerplate/shared-prisma';
/**
 * Credits for one turn: per-1k-token rates with a per-turn floor. Rounded up
 * to 6 decimals (the ledger's scale) so we never under-charge by rounding.
 */
export function computeTurnCredits(usage, pricing) {
    const input = new Prisma.Decimal(usage.inputTokens).div(1000).mul(pricing.creditsPer1kInputTokens);
    const output = new Prisma.Decimal(usage.outputTokens).div(1000).mul(pricing.creditsPer1kOutputTokens);
    return Prisma.Decimal.max(input.plus(output), pricing.minTurnCredits).toDecimalPlaces(6, Prisma.Decimal.ROUND_UP);
}
/** Rough token estimate (~4 chars/token) for turns cut short before the model reported usage. */
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
//# sourceMappingURL=pricing.js.map