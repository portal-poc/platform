import type { PlatformEventBus } from '@portal-poc/platform-contract';

type PlatformEventBusOptions = {
  /**
   * Cross-tab delivery. Off by default: other tabs catch up through `refetchOnWindowFocus`, and later through the
   * backend's own notifications.
   */
  broadcastChannelName?: string;
};

type BroadcastMessage = {
  name: string;
  payload: unknown;
};

const isBroadcastMessage = (value: unknown): value is BroadcastMessage =>
  typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string' && 'payload' in value;

/**
 * In-tab event bus on EventTarget/CustomEvent: the transport behind `platform.events`. Payloads pass through as they
 * are; the event catalog (`@portal-poc/events`) validates them at both ends.
 *
 * Today it is how one app tells another that shared data changed (tasks → the host's bookmarks widget). The backend
 * stays the source of truth: an event only marks queries stale, the data is refetched. When the backend gets
 * notifications of its own (pub/sub to the browser), they become the primary signal and the bus the in-tab fast path.
 */
export const createPlatformEventBus = (options: PlatformEventBusOptions = {}): PlatformEventBus => {
  const target = new EventTarget();
  const channel =
    options.broadcastChannelName && typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(options.broadcastChannelName)
      : null;

  const dispatchLocal = (name: string, payload: unknown) => {
    target.dispatchEvent(new CustomEvent(name, { detail: payload }));
  };

  const handleBroadcast = (event: MessageEvent<unknown>) => {
    if (isBroadcastMessage(event.data)) {
      dispatchLocal(event.data.name, event.data.payload);
    }
  };

  channel?.addEventListener('message', handleBroadcast);

  const emit: PlatformEventBus['emit'] = (name, payload) => {
    dispatchLocal(name, payload);
    // BroadcastChannel.postMessage has no targetOrigin: the channel is same-origin by definition.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    channel?.postMessage({ name, payload } satisfies BroadcastMessage);
  };

  const subscribe: PlatformEventBus['subscribe'] = (name, listener) => {
    const handleEvent = (event: Event) => {
      if (event instanceof CustomEvent) {
        listener(event.detail);
      }
    };
    target.addEventListener(name, handleEvent);
    return () => {
      target.removeEventListener(name, handleEvent);
    };
  };

  return { emit, subscribe };
};
