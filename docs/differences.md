# Reference repo vs. the real project

- Monorepo for convenience; package/app boundaries follow polyrepo rules (apps never import each other; `workspace:^`
  stands in for Nexus versions; `portal-cli create` switches to `^1.0.0` outside a workspace).
- TypeScript `strict: true` (off in the real project).
- Mock auth by default (MSAL adapter implemented: `@portal/platform-runtime/msal`).
- No BFFs at all: each app injects a fake `fetch` with hard-coded data into the real http client.
- No realtime (the real project has WebSocket pub/sub); no API-contracts codegen (backend shared repo).
- React Router v8 instead of v7.
- The real project's shared host QueryClient and bookmark hacks are **removed** when migrating to this scheme:
  every app owns its QueryClient; cross-app updates go through events, never through a shared cache.
