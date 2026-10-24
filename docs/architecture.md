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
| `packages/platform-runtime` | `@portal/platform-runtime` — providers, auth adapters, http client, QueryClient factory, devtools, standalone, compat | platform repo |
| `packages/ds` | `@portal/ds` — Joy UI wrapper + loading primitives (MF singleton) | DS repo |
| `packages/mf-shared` | `@portal/mf-shared` — integration-contract constants (exposes, singletons, ranges) + shared config helper | platform repo |
| `packages/vite-config` | `@portal/vite-config` — build preset: pinned Vite + MF plugin, MF section of the contract, React Compiler | platform repo |
| `packages/presets` | `@portal/presets` — optional tsconfig / oxlint (incl. React Compiler rules) / fallow / vitest / steiger presets | platform repo |
| `packages/portal-cli` | `@portal/cli` (command `portal-cli`) — `create remote`, `add <layer>`, `verify`, `publish`, `release`, `registry check|build|status` | platform repo |
| `registry/` | Which version of which remote runs on which stand (`<stand>/<remote>.json`, `stands.json`) | registry repo |
| `tools/polyrepo` | Polyrepo dry run: Verdaccio (Nexus stand-in) + split every app into its own repo and check it ([`polyrepo.md`](./polyrepo.md)) | — |
| `tools/infra` | PoC stand-ins: Nexus (immutable artifacts) and stands (host + `/config.json` + `compat.json`) | — (infra) |

## Ports (local)

| Service | Port |
|---|---|
| host | 5173 |
| tasks-remote | 5174 |
| legacy-remote | 5175 |
| generated remotes (default) | 5176 |
| PoC Nexus | 4400 |
| Verdaccio (polyrepo dry run) | 4873 |
| stand uat / prod | 4501 / 4502 |

## Delivery

Releases go through immutable artifacts, a per-stand registry and three compatibility gates; local development has
three one-command modes. See [`delivery.md`](./delivery.md) and the migration path from the current project in
[`migration-plan.md`](./migration-plan.md).

## Key decisions (ADRs)

See [`docs/adr`](./adr). Open questions live in [`open-questions.md`](./open-questions.md); differences from the real
project in [`differences.md`](./differences.md); manual demo scenarios in [`demo.md`](./demo.md); React Router v8 notes
in [`router-v8.md`](./router-v8.md).

## Deviations from the requirements document

Decided with the project owner before implementation:

- **React Router v8** instead of v7 (see [`router-v8.md`](./router-v8.md)).
- **No API-contracts codegen** (section 15 is out of scope): each app hand-writes zod schemas in its own `shared/api`;
  mock BFFs keep their own types. Scenario 17 is therefore not implemented.
- **No realtime** (section 12 is out of scope): the real project already has WebSocket pub/sub. Removed: realtime
  client, `RealtimeProvider` / `useInvalidateOnEvent`, mock broker, BFF realtime channels, scenarios 6–9.
  Cross-app bookmarks refresh uses the local event bus from the contract (`platform.events`, `bookmarks.changed`)
  plus `refetchOnWindowFocus` as a safety net.
- **No mock backends**: each app's `shared/api` injects a fake `fetch` into the real `createHttpClient` (bearer + zod
  still run) that answers with hard-coded data and a configurable delay. Bookmarks live in `localStorage` so the host
  widget and the tasks remote see the same data.
- **CLI asks which optional FSD layers to create** (`entities` / `features` / `widgets`) in addition to `app`, `pages`,
  `shared` — overrides "CLI does not create empty layers" from section 16.1.
- Keep the code minimal: this is a PoC, not production code.
- **Linting** = oxlint (code style + React Compiler rules, native port of eslint-plugin-react-hooks v7) + Steiger (FSD)
  + **fallow** (unused files/exports/dependencies, duplication, FSD boundaries). All presets live in `@portal/presets`;
  apps extend them (`.oxlintrc.json`, `.fallowrc.json` with `extends: "npm:@portal/presets/fallow/<kind>.json"`).
- Optional parts implemented: `@portal/presets`, bridge demo (`legacy-remote`). Not implemented: preload hover demo
  (the architecture is ready — section 13), Playwright e2e.
