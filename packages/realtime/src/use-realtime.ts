import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { RealtimeClient, RealtimeSnapshot } from './create-realtime-client';

/**
 * Subscribes the component to a topic of its app's BFF while it is mounted (null: not now). The handler may change on
 * every render without re-subscribing. Works with React 18 and 19 (legacy bridge apps included).
 */
export const useRealtimeEvent = (client: RealtimeClient, topic: string | null, handler: (data: unknown) => void): void => {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!topic) {
      return undefined;
    }
    return client.subscribe(topic, (data) => handlerRef.current(data));
  }, [client, topic]);
};

/** The connection state and open topics, e.g. for a "live" indicator. */
export const useRealtimeSnapshot = (client: RealtimeClient): RealtimeSnapshot =>
  useSyncExternalStore(client.subscribeSnapshot, client.getSnapshot);
