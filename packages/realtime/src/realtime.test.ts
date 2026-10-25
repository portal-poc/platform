import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAuthEvent, PlatformContract } from '@portal-poc/platform-contract';
import { createRealtimeClient, TOKEN_REJECTED } from './create-realtime-client';
import type { RealtimeSocket } from './create-realtime-client';

type Listener = (event: never) => void;

class FakeSocket implements RealtimeSocket {
  readonly sent: unknown[] = [];
  closedWith: number | null = null;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000) {
    this.closedWith = code;
  }

  // The "server" side.
  emit(type: string, event: object = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }

  serverSend(frame: object) {
    this.emit('message', { data: JSON.stringify(frame) });
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0);

const setup = () => {
  const sockets: FakeSocket[] = [];
  const authListeners: Array<(event: PlatformAuthEvent) => void> = [];
  let tokenNumber = 0;
  const getAccessToken = vi.fn(async () => `t${(tokenNumber += 1)}`);
  const platform = {
    auth: {
      getAccessToken,
      subscribe: (listener: (event: PlatformAuthEvent) => void) => {
        authListeners.push(listener);
        return () => {};
      },
    },
    telemetry: { logError: vi.fn(), trackEvent: vi.fn() },
  } as unknown as PlatformContract;
  const onReconnect = vi.fn();
  const client = createRealtimeClient({
    platform: () => platform,
    target: () => ({ url: 'wss://tasks-bff/ws', scopes: ['tasks'] }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onReconnect,
    idleCloseMs: 1000,
  });
  /** Server accepts the connection: open → auth frame → ready. */
  const accept = async (socket: FakeSocket) => {
    socket.emit('open');
    socket.serverSend({ type: 'ready' });
    await flush();
  };
  return { client, sockets, getAccessToken, onReconnect, accept, authListeners };
};

describe('createRealtimeClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connects on the first subscription, authorizes in the first frame, then subscribes', async () => {
    const { client, sockets, getAccessToken, accept } = setup();
    const listener = vi.fn();
    expect(sockets).toHaveLength(0);

    client.subscribe('tasks', listener);
    await flush();
    const [socket] = sockets;
    if (!socket) {
      throw new Error('no socket');
    }
    await accept(socket);
    socket.serverSend({ type: 'event', topic: 'tasks', data: { id: '7' } });

    expect(getAccessToken).toHaveBeenCalledWith(['tasks'], undefined);
    expect(socket.url).toBe('wss://tasks-bff/ws');
    expect(socket.sent).toEqual([{ type: 'auth', token: 't1' }, { type: 'subscribe', topic: 'tasks' }]);
    expect(listener).toHaveBeenCalledWith({ id: '7' });
    expect(client.getSnapshot()).toEqual({ state: 'open', topics: ['tasks'] });
  });

  it('unsubscribes per topic and closes the socket after the last one, once idle', async () => {
    const { client, sockets, accept } = setup();
    const offList = client.subscribe('tasks', vi.fn());
    const offTask = client.subscribe('task:7', vi.fn());
    await flush();
    const socket = sockets[0] as FakeSocket;
    await accept(socket);

    offTask();
    expect(socket.sent.at(-1)).toEqual({ type: 'unsubscribe', topic: 'task:7' });
    offList();
    await vi.advanceTimersByTimeAsync(999);
    expect(socket.closedWith).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(socket.closedWith).toBe(1000);
    expect(client.getSnapshot()).toEqual({ state: 'idle', topics: [] });
  });

  it('reconnects with a force-refreshed token after the BFF rejects it, re-subscribes and reports the gap', async () => {
    const { client, sockets, getAccessToken, onReconnect, accept } = setup();
    client.subscribe('tasks', vi.fn());
    await flush();
    await accept(sockets[0] as FakeSocket);

    (sockets[0] as FakeSocket).emit('close', { code: TOKEN_REJECTED });
    expect(client.getSnapshot().state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2000);
    const second = sockets[1] as FakeSocket;
    await accept(second);

    expect(getAccessToken).toHaveBeenLastCalledWith(['tasks'], { forceRefresh: true });
    expect(second.sent).toEqual([{ type: 'auth', token: 't2' }, { type: 'subscribe', topic: 'tasks' }]);
    expect(onReconnect).toHaveBeenCalledOnce();
  });

  it('reconnects under the new account after an account switch', async () => {
    const { client, sockets, accept, authListeners } = setup();
    client.subscribe('tasks', vi.fn());
    await flush();
    await accept(sockets[0] as FakeSocket);

    for (const listener of authListeners) {
      listener({ type: 'account-changed', account: { id: 'bob', username: 'bob', displayName: 'Bob' } });
    }
    await flush();

    expect((sockets[0] as FakeSocket).closedWith).toBe(1000);
    expect(sockets).toHaveLength(2);
  });
});
