import type { PlatformAuthEvent, PlatformContract } from '@portal-poc/platform-contract';

/** Where the app's BFF socket is and which token it needs — per environment, like `HttpTarget`. */
export type RealtimeTarget = { url: string; scopes: readonly string[] };

/** The part of `WebSocket` the client uses: a fake socket (tests, the PoC's fake BFF) implements just this. */
export type RealtimeSocket = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: {
    (type: 'open', listener: () => void): void;
    (type: 'message', listener: (event: { data: unknown }) => void): void;
    (type: 'close', listener: (event: { code: number }) => void): void;
  };
};

export type RealtimeState = 'idle' | 'connecting' | 'open' | 'reconnecting';

export type RealtimeSnapshot = { state: RealtimeState; topics: readonly string[] };

export type RealtimeOptions = {
  /** The platform the app is mounted with, read when connecting (see `createPlatformBinding`). */
  platform: () => PlatformContract;
  /** The BFF socket of the current environment. */
  target: () => RealtimeTarget | Promise<RealtimeTarget>;
  /** Default: the browser's WebSocket. The PoC passes its fake BFF socket here (like axios' fetch adapter). */
  createSocket?: (url: string) => RealtimeSocket;
  /** After a reconnect events may have been missed: refetch what the app shows (e.g. invalidate its queries). */
  onReconnect?: () => void;
  /** The socket stays open this long after the last subscription ends (page transitions re-subscribe at once). */
  idleCloseMs?: number;
};

export type RealtimeClient = {
  /** Subscribes this app to a topic of its BFF; the socket opens on the first one. Returns unsubscribe. */
  subscribe: (topic: string, listener: (data: unknown) => void) => () => void;
  getSnapshot: () => RealtimeSnapshot;
  subscribeSnapshot: (listener: () => void) => () => void;
};

/** Protocol with the BFF: JSON frames. The token goes in the first frame, never in the URL (proxies log URLs). */
type ClientFrame = { type: 'auth'; token: string } | { type: 'subscribe' | 'unsubscribe'; topic: string };
type ServerFrame = { type: 'ready' } | { type: 'event'; topic: string; data: unknown };

/** Close codes of the BFF: the token was rejected (expired, revoked) → reconnect with a fresh one. */
export const TOKEN_REJECTED = 4401;
const NORMAL_CLOSE = 1000;
const MAX_BACKOFF_MS = 30_000;

const isServerFrame = (value: unknown): value is ServerFrame =>
  typeof value === 'object' && value !== null && 'type' in value && (value.type === 'ready' || value.type === 'event');

const browserSocket = (url: string): RealtimeSocket => new WebSocket(url);

/**
 * One app's realtime connection to ITS BFF: a WebSocket authorized with the host's login, opened by the first
 * subscription and closed after the last one, every topic owned by the code that subscribed (a page subscribes on
 * mount and unsubscribes on unmount). Reconnects with backoff and re-subscribes; a rejected token (4401) is replaced by
 * a force-refreshed one; an account change reconnects under the new account. Events are thin hints — the app
 * refetches through its http client; nothing here touches another app's data.
 */
export const createRealtimeClient = (options: RealtimeOptions): RealtimeClient => {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const snapshotListeners = new Set<() => void>();
  let snapshot: RealtimeSnapshot = { state: 'idle', topics: [] };
  let socket: RealtimeSocket | null = null;
  let connecting = false;
  let attempt = 0;
  let forceRefresh = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let watchedPlatform: PlatformContract | null = null;

  const publish = (state: RealtimeState) => {
    snapshot = { state, topics: [...listeners.keys()] };
    for (const listener of snapshotListeners) {
      listener();
    }
  };

  const send = (frame: ClientFrame) => {
    if (snapshot.state === 'open' || frame.type === 'auth') {
      socket?.send(JSON.stringify(frame));
    }
  };

  const report = (error: unknown) => {
    try {
      options.platform().telemetry.logError(error, { source: 'realtime' });
    } catch {
      // Not bound yet: nothing to report to.
    }
  };

  const disconnect = () => {
    clearTimeout(retryTimer);
    clearTimeout(idleTimer);
    const current = socket;
    socket = null;
    current?.close(NORMAL_CLOSE);
  };

  const scheduleReconnect = () => {
    attempt += 1;
    publish('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt) * (0.75 + Math.random() / 2);
    retryTimer = setTimeout(() => void connect(), delay);
  };

  const handleFrame = (frame: ServerFrame) => {
    if (frame.type === 'ready') {
      const reconnected = attempt > 0;
      attempt = 0;
      publish('open');
      for (const topic of listeners.keys()) {
        send({ type: 'subscribe', topic });
      }
      if (reconnected) {
        options.onReconnect?.();
      }
      return;
    }
    for (const listener of listeners.get(frame.topic) ?? []) {
      listener(frame.data);
    }
  };

  /** Account switch / logout: the socket was authorized as someone else. */
  const handleAuthEvent = (event: PlatformAuthEvent) => {
    if (event.type === 'token-refresh-failed') {
      return;
    }
    disconnect();
    if (listeners.size > 0 && event.type !== 'logout') {
      void connect();
    } else {
      publish('idle');
    }
  };

  const connect = async () => {
    if (connecting || socket) {
      return;
    }
    connecting = true;
    publish(attempt > 0 ? 'reconnecting' : 'connecting');
    try {
      const platform = options.platform();
      if (watchedPlatform !== platform) {
        watchedPlatform = platform;
        platform.auth.subscribe(handleAuthEvent);
      }
      const target = await options.target();
      const token = await platform.auth.getAccessToken(target.scopes, forceRefresh ? { forceRefresh: true } : undefined);
      forceRefresh = false;
      if (listeners.size === 0) {
        publish('idle');
        return;
      }
      const ws = (options.createSocket ?? browserSocket)(target.url);
      socket = ws;
      ws.addEventListener('open', () => send({ type: 'auth', token }));
      ws.addEventListener('message', (event) => {
        if (ws !== socket) {
          return;
        }
        try {
          const frame: unknown = JSON.parse(String(event.data));
          if (isServerFrame(frame)) {
            handleFrame(frame);
          }
        } catch (error) {
          report(error);
        }
      });
      ws.addEventListener('close', ({ code }) => {
        // A socket we closed ourselves (idle, account switch) is already replaced or not wanted.
        if (ws !== socket) {
          return;
        }
        socket = null;
        if (listeners.size === 0) {
          publish('idle');
          return;
        }
        forceRefresh = code === TOKEN_REJECTED;
        scheduleReconnect();
      });
    } catch (error) {
      // No token (signed out, interaction required) or no config: try again later, the host handles the login.
      report(error);
      if (listeners.size > 0) {
        scheduleReconnect();
      }
    } finally {
      connecting = false;
    }
  };

  return {
    subscribe: (topic, listener) => {
      clearTimeout(idleTimer);
      let topicListeners = listeners.get(topic);
      if (!topicListeners) {
        topicListeners = new Set();
        listeners.set(topic, topicListeners);
        send({ type: 'subscribe', topic });
      }
      topicListeners.add(listener);
      publish(snapshot.state);
      void connect();

      return () => {
        topicListeners.delete(listener);
        if (topicListeners.size > 0 || listeners.get(topic) !== topicListeners) {
          return;
        }
        listeners.delete(topic);
        send({ type: 'unsubscribe', topic });
        publish(snapshot.state);
        if (listeners.size === 0) {
          idleTimer = setTimeout(() => {
            disconnect();
            attempt = 0;
            publish('idle');
          }, options.idleCloseMs ?? 5000);
        }
      };
    },
    getSnapshot: () => snapshot,
    subscribeSnapshot: (listener) => {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
      };
    },
  };
};
