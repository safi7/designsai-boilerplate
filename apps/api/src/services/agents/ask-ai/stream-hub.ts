import type { RedisClient } from '@boilerplate/shared-cache';
import type { Logger } from '@boilerplate/shared-logger';
import type { StreamFrame, ThreadEvent } from '@boilerplate/shared-schemas';

export type HubMessage = { kind: 'event'; event: ThreadEvent } | { kind: 'frame'; frame: StreamFrame };

export interface TurnSnapshot {
  seq: number;
  content: string;
}

type Listener = (message: HubMessage) => void;

const threadChannel = (threadId: string) => `ask-ai:thread:${threadId}`;
const cancelChannel = (turnId: string) => `ask-ai:cancel:${turnId}`;
const snapshotKey = (turnId: string) => `ask-ai:turn-snapshot:${turnId}`;
const SNAPSHOT_TTL_SECONDS = 15 * 60;

/**
 * Cross-replica fan-out for live chat traffic over Redis pub/sub.
 *
 * The replica running a turn is usually not the one holding the browser's SSE
 * connection, so everything live goes through Redis: durable events (after
 * they are committed to MySQL), ephemeral text deltas, and cancel signals.
 * One SUBSCRIBE connection is multiplexed across all local listeners.
 */
export class StreamHub {
  private readonly listeners = new Map<string, Set<(raw: string) => void>>();

  constructor(
    private readonly publisher: RedisClient,
    private readonly subscriber: RedisClient,
    private readonly logger: Logger
  ) {
    this.subscriber.on('message', (channel: string, raw: string) => {
      for (const listener of this.listeners.get(channel) ?? []) {
        try {
          listener(raw);
        } catch (error) {
          this.logger.warn('Stream listener threw', { channel, error: error instanceof Error ? error.message : String(error) });
        }
      }
    });
  }

  async publish(threadId: string, message: HubMessage): Promise<void> {
    await this.publisher.publish(threadChannel(threadId), JSON.stringify(message));
  }

  /** Resolves once the SUBSCRIBE is acknowledged, so no message published afterwards is missed. */
  async subscribe(threadId: string, listener: Listener): Promise<() => Promise<void>> {
    return this.subscribeRaw(threadChannel(threadId), raw => listener(JSON.parse(raw) as HubMessage));
  }

  async requestCancel(turnId: string): Promise<void> {
    await this.publisher.publish(cancelChannel(turnId), '1');
  }

  onCancel(turnId: string, listener: () => void): Promise<() => Promise<void>> {
    return this.subscribeRaw(cancelChannel(turnId), () => listener());
  }

  async writeSnapshot(turnId: string, snapshot: TurnSnapshot): Promise<void> {
    await this.publisher.setex(snapshotKey(turnId), SNAPSHOT_TTL_SECONDS, JSON.stringify(snapshot));
  }

  async readSnapshot(turnId: string): Promise<TurnSnapshot | null> {
    const raw = await this.publisher.get(snapshotKey(turnId));
    return raw ? (JSON.parse(raw) as TurnSnapshot) : null;
  }

  async clearSnapshot(turnId: string): Promise<void> {
    await this.publisher.del(snapshotKey(turnId));
  }

  private async subscribeRaw(channel: string, listener: (raw: string) => void): Promise<() => Promise<void>> {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      await this.subscriber.subscribe(channel);
    }
    set.add(listener);

    let active = true;
    return async () => {
      if (!active) return;
      active = false;
      const current = this.listeners.get(channel);
      current?.delete(listener);
      if (current && current.size === 0) {
        this.listeners.delete(channel);
        await this.subscriber.unsubscribe(channel).catch(() => undefined);
      }
    };
  }
}
