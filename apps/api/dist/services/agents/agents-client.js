import { AskAiTurnFrameSchema, ThreadTitleResponseSchema, } from '@boilerplate/shared-schemas';
import { AppError, ERROR_CODES } from '@boilerplate/shared-utils';
/**
 * Service-to-service client for the agents runtime (apps/agents).
 *
 * The API owns users, credits and persistence; the agents service owns model
 * execution and conversation memory. Every call carries the shared
 * `x-internal-service-token`, and the agents service is never exposed publicly.
 */
export class AgentsClient {
    baseUrl;
    token;
    logger;
    constructor(baseUrl, token, logger) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.logger = logger;
    }
    /** Streams one chat turn as NDJSON frames. */
    async *streamTurn(request, signal) {
        let response;
        try {
            response = await fetch(`${this.baseUrl}/internal/agents/ask-ai/turn/stream`, {
                method: 'POST',
                headers: this.headers({ accept: 'application/x-ndjson' }),
                body: JSON.stringify(request),
                signal,
            });
        }
        catch (error) {
            if (signal.aborted)
                throw error;
            throw new AppError(ERROR_CODES.AGENT_UNAVAILABLE, { cause: error });
        }
        if (!response.ok || !response.body) {
            const body = await response.text().catch(() => '');
            this.logger.error('Agents turn request failed', { status: response.status, body: body.slice(0, 500) });
            throw new AppError(response.status >= 500 ? ERROR_CODES.AGENT_UNAVAILABLE : ERROR_CODES.AGENT_ERROR);
        }
        for await (const line of readLines(response.body)) {
            const parsed = AskAiTurnFrameSchema.safeParse(safeJson(line));
            if (!parsed.success) {
                this.logger.warn('Dropping malformed agents frame', { line: line.slice(0, 200) });
                continue;
            }
            yield parsed.data;
        }
    }
    async generateTitle(request, timeoutMs = 15_000) {
        const response = await fetch(`${this.baseUrl}/internal/agents/thread-title/generate`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok)
            throw new AppError(ERROR_CODES.AGENT_ERROR, { message: `Title generation failed (${response.status})` });
        return ThreadTitleResponseSchema.parse(await response.json()).title;
    }
    async health(timeoutMs = 2_000) {
        try {
            const response = await fetch(`${this.baseUrl}/internal/agents/health`, { headers: this.headers(), signal: AbortSignal.timeout(timeoutMs) });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    headers(extra = {}) {
        return { 'content-type': 'application/json', 'x-internal-service-token': this.token, ...extra };
    }
}
function safeJson(line) {
    try {
        return JSON.parse(line);
    }
    catch {
        return undefined;
    }
}
/** Split a byte stream into newline-delimited records. */
export async function* readLines(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let newline = buffer.indexOf('\n');
            while (newline !== -1) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (line)
                    yield line;
                newline = buffer.indexOf('\n');
            }
        }
        const rest = (buffer + decoder.decode()).trim();
        if (rest)
            yield rest;
    }
    finally {
        reader.releaseLock();
    }
}
//# sourceMappingURL=agents-client.js.map