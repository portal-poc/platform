# @portal-poc/realtime

**Optional.** One app's WebSocket to ITS OWN BFF, authorized with the host's login. Built for "the backend tells the
page to refetch": a Temporal workflow finished → the BFF sends a thin event on a topic → the page invalidates its
queries and reloads through REST. Replaces the host-owned global pubsub on `window`: the host knows nothing about
remotes' sockets. Teams may use another client, as long as the token comes from `platform.auth`.

```sh
pnpm add @portal-poc/realtime   # peer: react >= 18.3 (works in React 18 bridge apps)
```

## Exports

| Export | Use it to |
|---|---|
| `createRealtimeClient({ platform, target, createSocket?, onReconnect?, idleCloseMs? })` | One client per app per BFF (module level, like the http client). `target()` → `{ url, scopes }` per stand. |
| `client.subscribe(topic, listener)` → unsubscribe | Low-level subscription (outside React). |
| `useRealtimeEvent(client, topic \| null, handler)` | Subscribe a component while it is mounted (`null` = not now). The handler may change every render. |
| `useRealtimeSnapshot(client)` | `{ state, topics }` for a "live" indicator. |
| `TOKEN_REJECTED` (4401) | The close code your BFF sends for an expired / revoked token. |
| `RealtimeClient`, `RealtimeOptions`, `RealtimeTarget`, `RealtimeSocket`, `RealtimeSnapshot`, `RealtimeState` | Types (`RealtimeSocket` is what a fake socket implements in tests). |

```ts
export const realtime = createRealtimeClient({
  platform: remotePlatform.get,
  target: async () => ({ url: (await config()).realtimeUrl, scopes: (await config()).scopes }),
  onReconnect: () => queryClient.invalidateQueries(),
});

// pages/list: refetch the list whenever the BFF says it changed
useRealtimeEvent(realtime, 'tasks', () => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
// pages/details
useRealtimeEvent(realtime, `task:${taskId}`, () => queryClient.invalidateQueries({ queryKey: ['task', taskId] }));
```

## How it behaves

1. The first subscription opens the socket (lazily); the token goes in the first frame (`{ type: 'auth', token }`),
   never in the URL.
2. Close code `4401` → token force-refreshed → reconnect. An account switch reconnects with the new token.
3. Connection lost → reconnect with backoff → resubscribe every open topic → `onReconnect()` (events may have been
   missed: refetch).
4. Topics belong to the code that subscribed: a page subscribes on mount and unsubscribes on unmount; after the
   last one the socket closes after `idleCloseMs` (5 s; page transitions re-subscribe in between).

## The BFF side (what your backend implements)

`wss://<bff>/ws`; first frame `{ type: 'auth', token }` (validate like a REST call, close `4401` if invalid, answer
`{ type: 'ready' }` if valid); then `{ type: 'subscribe' | 'unsubscribe', topic }`; push
`{ type: 'event', topic, data }` with ids only. Topics are
per-BFF and granular (`tasks`, `task:<id>`).

Decision: [ADR 0026 — realtime: each app's own socket to its BFF](../../docs/adr/0026-realtime-per-app.md).
