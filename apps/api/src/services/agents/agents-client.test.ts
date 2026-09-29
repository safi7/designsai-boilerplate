import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSilentLogger } from '../../test/fakes.js';
import { AgentsClient, readLines } from './agents-client.js';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('readLines', () => {
  it('reassembles records split across chunks', async () => {
    const lines: string[] = [];
    for await (const line of readLines(streamOf(['{"a":', '1}\n{"b"', ':2}\n\n{"c":3}']))) lines.push(line);
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });
});

describe('AgentsClient.streamTurn', () => {
  it('yields valid frames, skips malformed ones and sends the internal token', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          streamOf([
            '{"type":"text-delta","delta":"Hel"}\n',
            'garbage\n',
            '{"type":"text-delta","delta":"lo"}\n',
            '{"type":"finish","text":"Hello","modelId":"m","usage":{"inputTokens":3,"outputTokens":2}}\n',
          ]),
          {
            status: 200,
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new AgentsClient('http://agents:8111', 'token-xyz', createSilentLogger());
    const frames = [];
    for await (const frame of client.streamTurn(
      { userId: '1', threadId: 't', mastraThreadId: 'm', turnId: 'u', message: 'hi' },
      new AbortController().signal
    )) {
      frames.push(frame);
    }

    expect(frames.map(f => f.type)).toEqual(['text-delta', 'text-delta', 'finish']);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-internal-service-token']).toBe('token-xyz');
  });

  it('maps upstream 5xx to agent_unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 }))
    );
    const client = new AgentsClient('http://agents:8111', 'token', createSilentLogger());
    const run = async () => {
      for await (const _ of client.streamTurn(
        { userId: '1', threadId: 't', mastraThreadId: 'm', turnId: 'u', message: 'hi' },
        new AbortController().signal
      )) {
        // drain
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'agent_unavailable' });
  });
});
