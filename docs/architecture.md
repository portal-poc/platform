# Architecture overview

This repository is the **reference monorepo** for the Portal micro-frontend platform. It demonstrates every architectural
decision from [`PORTAL_MFE_CONTEXT.md`](../PORTAL_MFE_CONTEXT.md) (the full requirements document; read it first) and is
meant to be split into separate repositories (polyrepo) later.

## Map

| Path | What | Polyrepo destination |
|---|---|---|
| `apps/host` | Host application (data router, MSAL/mock auth, remote loading, route-level view transitions, bookmarks widget, devtools toolbar, demo panel) | host repo |
| `apps/tasks-remote` | Remote A, FSD 2.1, equivalent to `portal-cli create remote tasks` + demo pages | tasks team repo |
| `apps/legacy-remote` | React 18 remote, loaded through MF Bridge (isolated mode) | legacy team repo |
| `packages/platform-contract` | `@portal/platform-contract` — types only + `PLATFORM_CONTRACT_VERSION` | platform repo |
| `packages/platform-runtime` | `@portal/platform-runtime` — providers, auth adapters, http client, QueryClient factory, realtime, devtools, standalone, compat | platform repo |
| `packages/ds` | `@portal/ds` — Joy UI wrapper + loading primitives (MF singleton) | DS repo |
| `packages/mf-shared` | `@portal/mf-shared` — integration-contract constants (exposes, singletons, ranges) + shared config helper | platform repo |
| `packages/presets` | `@portal/presets` — optional tsconfig / oxlint / vitest / steiger presets | platform repo |
| `packages/portal-cli` | `portal-cli` — `create remote`, `add <layer>`, `verify` | platform repo |
| `mock-backend/broker` | In-memory event broker standing in for Kafka | — (infra) |
| `mock-backend/host-bff` | Host BFF: bookmarks aggregate, host realtime channel | host backend |
| `mock-backend/tasks-bff` | Tasks BFF: tasks, bookmarks, tasks realtime channel | tasks backend |

## Ports (local)

| Service | Port |
|---|---|
| host | 5173 |
| tasks-remote | 5174 |
| legacy-remote | 5175 |
| host-bff | 4100 |
| tasks-bff | 4200 |
| broker | 4300 |

## Key decisions (ADRs)

See [`docs/adr`](./adr). Open questions live in [`open-questions.md`](./open-questions.md); differences from the real
project in [`differences.md`](./differences.md); manual demo scenarios in [`demo.md`](./demo.md).

## Deviations from the requirements document

Decided with the project owner before implementation:

- **React Router v8** instead of v7 (see [`router-v8.md`](./router-v8.md)).
- **No API-contracts codegen** (section 15 is out of scope): each app hand-writes zod schemas in its own `shared/api`;
  mock BFFs keep their own types. Scenario 17 is therefore not implemented.
- Optional parts implemented: `@portal/presets`, bridge demo (`legacy-remote`). Not implemented: preload hover demo
  (the architecture is ready — section 13), Playwright e2e.
