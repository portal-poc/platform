# PoC vs. the real project

What the PoC simplifies or does differently — so nobody mistakes a shortcut for a recommendation.

| Area | PoC | Real project / production |
|---|---|---|
| Repositories | GitHub organisation `portal-poc`, one repository per app + `platform` + `registry` | Azure DevOps (the pipelines map 1:1: reusable workflows ↔ pipeline templates) |
| Packages | GitHub Packages, scope `@portal-poc` | Nexus npm hosted repository, internal scope never proxied from npmjs |
| Infrastructure | One small VPS: Nexus CE + nginx stands at `*.poc.ashirokov.dev` (ADR 0021) | The company's Nexus and stand hosting; same raw repositories and paths |
| Registry writes from CI | A deploy key with write access | A GitHub App / service account |
| Stands | dev3 (snapshot), dev2, dev1, tst; no prod | The same plus prod (promoted from tst) |
| Auth | Mock auth by default (accounts in the demo panel); the MSAL adapter is implemented (`@portal-poc/platform-runtime/msal`) | MSAL; impersonation header next to the bearer token (not in the PoC yet, ADR 0022) |
| Backends | No BFFs: each app puts a fake `fetch` behind its real axios client (tokens, headers, zod run as in production); tasks and bookmarks live in `localStorage` | One BFF per remote, host-bff |
| Realtime | None; cross-app updates through the local event bus + `refetchOnWindowFocus` | WebSocket pub/sub (today in the host via `window`; target: per-remote subscriptions, migration phase A4) |
| API types | Hand-written zod schemas per app | Generated from the backend specs repository |
| TypeScript | `strict: true` | `strict` off |
| React Router | v8 | v7 |
| Legacy app | `legacy-remote`: React 18 + React Router 7 in an MF bridge, uses the contract's auth directly | A legacy app currently rebuilt on the remote stack with its own auth in the host (migration phase A6) |
| QueryClient | Own per app; the real project's shared host QueryClient and its key-prefix rules are **removed** in the target | One shared QueryClient |
| E2E tests | None yet | — |
