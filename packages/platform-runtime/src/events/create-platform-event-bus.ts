import type { PlatformEventBus, PlatformEventMap } from '@portal-poc/platform-contract';

type PlatformEventBusOptions = {
  /** MAY: cross-tab delivery. Off by default: server-side realtime already covers other tabs. */
  broadcastChannelName?: string;
};

type BroadcastMessage = {
  name: string;
  payload: unknown;
};

const isBroadcastMessage = (value: unknown): value is BroadcastMessage =>
  typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string' && 'payload' in value;

/**
 * In-tab event bus on EventTarget/CustomEvent. Used as an optional fast path, never as the primary invalidation
 * mechanism (the backend is the source of truth about "data changed").
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

  const subscribe: PlatformEventBus['subscribe'] = <TName extends keyof PlatformEventMap>(
    name: TName,
    listener: (payload: PlatformEventMap[TName]) => void,
  ) => {
    const handleEvent = (event: Event) => {
      if (event instanceof CustomEvent) {
        // The bus is the only producer of events with this name, and `emit` is typed by PlatformEventMap.
        listener(event.detail as PlatformEventMap[TName]);
      }
    };
    target.addEventListener(name, handleEvent);
    return () => {
      target.removeEventListener(name, handleEvent);
    };
  };

  return { emit, subscribe };
};
