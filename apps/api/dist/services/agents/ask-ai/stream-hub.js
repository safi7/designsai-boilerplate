const threadChannel = (threadId) => `ask-ai:thread:${threadId}`;
const cancelChannel = (turnId) => `ask-ai:cancel:${turnId}`;
const snapshotKey = (turnId) => `ask-ai:turn-snapshot:${turnId}`;
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
    publisher;
    subscriber;
    logger;
    listeners = new Map();
    constructor(publisher, subscriber, logger) {
        this.publisher = publisher;
        this.subscriber = subscriber;
        this.logger = logger;
        this.subscriber.on('message', (channel, raw) => {
            for (const listener of this.listeners.get(channel) ?? []) {
                try {
                    listener(raw);
                }
                catch (error) {
                    this.logger.warn('Stream listener threw', { channel, error: error instanceof Error ? error.message : String(error) });
                }
            }
        });
    }
    async publish(threadId, message) {
        await this.publisher.publish(threadChannel(threadId), JSON.stringify(message));
    }
    /** Resolves once the SUBSCRIBE is acknowledged, so no message published afterwards is missed. */
    async subscribe(threadId, listener) {
        return this.subscribeRaw(threadChannel(threadId), raw => listener(JSON.parse(raw)));
    }
    async requestCancel(turnId) {
        await this.publisher.publish(cancelChannel(turnId), '1');
    }
    onCancel(turnId, listener) {
        return this.subscribeRaw(cancelChannel(turnId), () => listener());
    }
    async writeSnapshot(turnId, snapshot) {
        await this.publisher.setex(snapshotKey(turnId), SNAPSHOT_TTL_SECONDS, JSON.stringify(snapshot));
    }
    async readSnapshot(turnId) {
        const raw = await this.publisher.get(snapshotKey(turnId));
        return raw ? JSON.parse(raw) : null;
    }
    async clearSnapshot(turnId) {
        await this.publisher.del(snapshotKey(turnId));
    }
    async subscribeRaw(channel, listener) {
        let set = this.listeners.get(channel);
        if (!set) {
            set = new Set();
            this.listeners.set(channel, set);
            await this.subscriber.subscribe(channel);
        }
        set.add(listener);
        let active = true;
        return async () => {
            if (!active)
                return;
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
//# sourceMappingURL=stream-hub.js.map