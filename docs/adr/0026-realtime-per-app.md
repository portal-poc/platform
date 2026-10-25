# ADR 0026: Realtime — each app's own socket to its BFF

Supersedes [ADR 0010](./0010-realtime.md) (realtime out of scope).

## Context

The real project's pub/sub lives in the host and reaches remotes through `window`; subscriptions are global. The
backend is moving to granular subscriptions per BFF: a remote opens and closes subscriptions to its own events on its
own BFF. A host-owned channel would keep remotes coupled to host internals and to every other app's events, and the
host would have to know every BFF.

## Decision

- **One WebSocket per app per BFF**, opened by the app, never by the host. Same model as HTTP (ADR 0022): the app
  owns the connection, the host owns the login.
- **`@portal-poc/realtime`** (opt-in platform utility, no React requirement for the client; hooks for React 18/19):
  `createRealtimeClient({ platform, target, createSocket?, onReconnect? })`.
  - Lazy: the socket opens with the first subscription and closes a few seconds after the last one.
  - Auth: `platform.auth.getAccessToken(target.scopes)` — the BFF's audience, through the remote's scope allowlist —
    sent in the **first frame** (never in the URL). Close code `4401` = token rejected → reconnect with a
    force-refreshed token. An account switch reconnects under the new account; logout closes.
  - Subscriptions are owned by the code that made them: `useRealtimeEvent(client, topic, handler)` subscribes while
    the component is mounted (a list page: `tasks`; a details page: `task:<id>`), so leaving a page unsubscribes.
  - Reconnect with backoff, re-subscribe, `onReconnect` (events may have been missed → the app invalidates its own
    queries).
  - Protocol: JSON frames — client `auth` / `subscribe` / `unsubscribe`; server `ready` / `event { topic, data }`.
- **Events are thin** (`{ type: 'task.changed', taskId }`): the app invalidates its queries and refetches through
  its http client. Nothing crosses into another app; cross-app signals stay on the local bus (ADR 0023).
- **Not in the contract**: realtime is a library, not a platform service. A team may use another client; it still
  gets its token from `platform.auth` like any request.
- PoC: tasks-bff's socket is a fake in the browser speaking the same protocol (like the fake `fetch` behind axios);
  it pushes to the sockets of every tab (BroadcastChannel), as a real BFF pushes a colleague's change.

## Consequences

- The host has no realtime code and no knowledge of BFF sockets; `window` hand-over disappears.
- A remote's subscriptions are visible and bounded (the tasks page shows its socket state and open topics); a page
  that is not on screen receives nothing.
- N apps open N sockets at most while their pages are on screen — usually one or two. If the backend prefers one
  socket per page, the client can be replaced by a host-multiplexed implementation behind the same hook without
  touching pages.
- Migration (phase A4): the host's pub/sub keeps working for apps not migrated; a migrated remote switches its
  subscriptions to `useRealtimeEvent` on its BFF once the BFF exposes them.
