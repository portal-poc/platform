# @portal-poc/http

**Your app's HTTP client, bound to the host's login.** You create an axios instance with your own settings; this
package adds the bearer token for your BFF's scopes, one retry after a 401 with a refreshed token, the host's login
when the BFF demands interaction, correlation ids on mutations, and zod validation of responses. Replaces `useHttp`
from `window.env`: nothing global, each app owns its client and its BFF configuration.

```sh
pnpm add @portal-poc/http axios zod
```

## Exports

| Export | Use it to |
|---|---|
| `createPlatformBinding(appName)` → `{ bind, get }` | Hold the platform as a module-level value. The client is created on import, the platform arrives at mount: entries call `bind(platform)` (generated `RemoteRoot`, standalone, `./preload`), the client calls `get()` per request. |
| `attachPlatformAuth(instance, { platform, target, clientVersion? })` | Bind an axios instance to the login. `target()` returns `{ baseUrl, scopes }` for the current stand (may be async: read your `config.json`). Sets `baseURL` unless a request has its own. |
| `parseResponse(schema)` | `http.get('/tasks').then(parseResponse(taskListSchema))`: typed, validated body. A mismatch throws `ResponseValidationError` (the query fails, telemetry logs it) — never silently trusted data. |
| `ResponseValidationError` | Recognise a backend contract mismatch. |
| `CORRELATION_ID_HEADER` (`X-Correlation-Id`) | Set by the client on POST/PUT/PATCH/DELETE unless you set it — reuse it in an event or a log line. |
| `CLIENT_VERSION_HEADER` (`X-Client-Version`) | `name@version` of the calling app, for BFF logs (and a compatibility window later). |
| `HttpTarget`, `PlatformAuthOptions`, `PlatformBinding` | Types. |

## Setup (as generated in `shared/api/http.ts`)

```ts
export const remotePlatform = createPlatformBinding(REMOTE_NAME);

export const http = attachPlatformAuth(create({ timeout: 15_000 }), {
  platform: remotePlatform.get,
  target: async () => {
    const { bffBaseUrl, scopes } = await getRemoteEnvConfig(remotePlatform.get().env.name);
    return { baseUrl: bffBaseUrl, scopes };
  },
  clientVersion: `${REMOTE_NAME}@${PORTAL_APP_VERSION}`,
});
```

`public/config.json` holds `bffBaseUrl` and `scopes` per environment (`local`, `dev3`, …). The scopes must also be in
the remote's registry entry: the host refuses tokens for anything else (`PlatformScopeNotAllowedError`).

## Rules

- One client per BFF, created once per module. Add your own interceptors freely; do not read tokens yourself.
- Never call `login` / redirect: a 401 that refresh cannot fix asks the host (`auth.requestInteraction`), the request
  fails, and the user retries after logging in.
- Validate every response you render (`parseResponse`). The BFF is deployed separately from your app.

Decision: [ADR 0022 — HTTP: each app's axios, bound to the host's login](../../docs/adr/0022-http-axios-bound-to-host-auth.md).
