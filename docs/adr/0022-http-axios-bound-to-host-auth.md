# ADR 0022: HTTP — each app's axios, bound to the host's login

## Context

The platform shipped its own fetch-based client (`createHttpClient` in `platform-runtime`), reachable in a remote only
through a hook (`useRemoteHttp`): the platform (auth) arrives as a prop at mount time and the BFF address per
environment from `config.json`, so the client could not exist at module level. Consequences: no client outside React
(preload, plain modules), the client threaded through every `queryOptions` factory, no way for a team to configure
its own client — while the real project uses axios. The client lived in a React 19 package, so the React 18 legacy
remote could not use it at all.

## Decision

- **axios is the http client** of every app. Each app creates its OWN instance at module level with its own settings
  (timeouts, interceptors, adapters) and exports it from `shared/api` for its slices.
- **`@portal-poc/http`** (no React; peers `axios`, `zod`) binds such an instance to the host's login:
  - `attachPlatformAuth(instance, { platform, target, clientVersion })`: per request a bearer token for the target's
    scopes (`platform.auth.getAccessToken`), `baseURL` of the current environment, `X-Client-Version`,
    `X-Correlation-Id` on mutations unless set by the caller; after a 401 one retry with a force-refreshed token; the
    host asked to log in (`requestInteraction`) when the token cache or the BFF demand interaction — an app never
    redirects itself.
  - `createPlatformBinding(name)`: the platform as a module-level value — `RemoteRoot` (every mode) and `preload` call
    `bind(platform)`; the client reads it per request, so an account switch or a re-mount is picked up.
  - `parseResponse(schema)`: zod-validated body (`ResponseValidationError` otherwise): responses stay a trust boundary.
- **`platform-runtime` 2.0** drops its http client. The QueryClient retry policy recognises axios errors by shape
  (`isAxiosError`) and platform errors by name: they come from other copies of the code (the host's auth, each app's
  bundle), where `instanceof` fails.
- A fake backend stays a fake `fetch`, put behind the real client through axios' fetch adapter (`adapter: 'fetch'`,
  `env.fetch`): tokens, headers and parsing run as in production.

## Consequences

- `http.get('/tasks', { signal, params }).then(parseResponse(taskListSchema))` anywhere in the app; query and
  mutation factories take no client parameter.
- Teams own their axios configuration; the platform owns only the auth binding and the error policy.
- The legacy (React 18) remote can use the same package when it needs an API.
- Released remotes keep their bundled runtime 1.x client: nothing in the contract changed.
