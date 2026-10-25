# Architecture overview

The PoC of the portal micro-frontend platform, split into the repositories of the
[`portal-poc`](https://github.com/portal-poc) organisation as the real teams would own them. It demonstrates the
decisions taken on [`PORTAL_MFE_CONTEXT.md`](../PORTAL_MFE_CONTEXT.md) (the original requirements document; where the
PoC deviates, the deviations below and the ADRs win).

## Map

| Repository / path | What | Owner in reality |
|---|---|---|
| [`host`](https://github.com/portal-poc/host) | Host application (data router, MSAL/mock auth, remote loading with compatibility checks and bridge fallback, route-level view transitions, bookmarks widget, devtools toolbar, demo panel) | host team |
| [`tasks-remote`](https://github.com/portal-poc/tasks-remote) | Remote "tasks", FSD 2.1, equivalent to `portal-cli create remote tasks` + demo pages | product team |
| [`legacy-remote`](https://github.com/portal-poc/legacy-remote) | React 18 remote, loaded through MF Bridge (isolated mode) | another team |
| [`registry`](https://github.com/portal-poc/registry) | Which version of which remote runs on which stand (`<stand>/<remote>.json`, `stands.json`); its Config deploy uploads each stand's `/config.json` | platform + teams (CODEOWNERS) |
| `platform/packages/platform-contract` | `@portal-poc/platform-contract` — types only + `PLATFORM_CONTRACT_VERSION` | platform team |
| `platform/packages/platform-runtime` | `@portal-poc/platform-runtime` — providers, auth adapters, QueryClient factory, event bus, leave guards and page titles ([ADR 0024](adr/0024-leave-guards-and-page-titles.md)), devtools, standalone, compat, stale-tab reload | platform team |
| `platform/packages/http` | `@portal-poc/http` — each app's own axios instance bound to the host's login ([ADR 0022](adr/0022-http-axios-bound-to-host-auth.md)) | platform team |
| `platform/packages/realtime` | `@portal-poc/realtime` — opt-in: an app's own WebSocket to its BFF, authorized by the host's login ([ADR 0026](adr/0026-realtime-per-app.md)) | platform team |
| `platform/packages/events` | `@portal-poc/events` — the catalog of cross-app events on the local bus, validated publish/subscribe ([ADR 0023](adr/0023-event-catalog.md)) | platform team, events owned by their publishers |
| `platform/packages/ds` | `@portal-poc/ds` — Joy UI wrapper + loading primitives (MF singleton) | DS team |
| `platform/packages/mf-shared` | `@portal-poc/mf-shared` — integration-contract constants (exposes, singletons, ranges) + shared config helper | platform team |
| `platform/packages/vite-config` | `@portal-poc/vite-config` — build preset: pinned Vite + MF plugin, MF section of the contract, React Compiler | platform team |
| `platform/packages/presets` | `@portal-poc/presets` — optional tsconfig / oxlint (incl. React Compiler rules) / fallow / vitest / steiger presets | platform team |
| `platform/packages/portal-cli` | `@portal-poc/cli` (command `portal-cli`) — scaffolding, verification, deploys, registry ([README](../packages/portal-cli/README.md)) | platform team |
| `platform/.github/workflows` | Reusable workflows every app calls, pinned to `@v2`: `app-ci`, `deploy` (remotes), `deploy-host`, `forward-merge` | platform team |

## Infrastructure (hosted, [ADR 0021](adr/0021-hosted-poc-stands.md))

| What | Where |
|---|---|
| Nexus (raw: `portal-releases`, `portal-snapshots`, `portal-stands`) | https://nexus.poc.ashirokov.dev |
| Stands dev3 (snapshot) / dev2 / dev1 (release lines) / tst (promoted) | https://dev3.poc.ashirokov.dev, `dev2.`, `dev1.`, `tst.` |

## Ports (local dev servers)

| Service | Port |
|---|---|
| host | 5173 |
| tasks-remote | 5174 |
| legacy-remote | 5175 |
| generated remotes (default) | 5176 |

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
- **Realtime per app** instead of section 12's provider: each app opens its own socket to its BFF
  (`@portal-poc/realtime`, [ADR 0026](adr/0026-realtime-per-app.md)); tasks subscribes per page (`tasks`,
  `task:<id>`) on a fake BFF socket. Cross-app bookmarks refresh uses the local event bus (`platform.events`, event
  `bookmarks.changed` of the catalog in `@portal-poc/events`) plus `refetchOnWindowFocus` for other tabs.
- **No mock backends**: each app's `shared/api` puts a fake `fetch` behind its real axios client (axios' fetch adapter;
  bearer + zod still run) that answers with hard-coded data and a configurable delay. Bookmarks live in `localStorage` so the host
  widget and the tasks remote see the same data.
- **CLI asks which optional FSD layers to create** (`entities` / `features` / `widgets`) in addition to `app`, `pages`,
  `shared` — overrides "CLI does not create empty layers" from section 16.1.
- Keep the code minimal: this is a PoC, not production code.
- **Linting** = oxlint (code style + React Compiler rules, native port of eslint-plugin-react-hooks v7) + Steiger (FSD)
  + **fallow** (unused files/exports/dependencies, duplication). All presets live in `@portal-poc/presets`;
  apps extend them (`.oxlintrc.json`, `.fallowrc.json` with `extends: "npm:@portal-poc/presets/fallow/<kind>.json"`).
- Optional parts implemented: `@portal-poc/presets`, bridge demo (`legacy-remote`), preload on hover (section 13,
  [ADR 0011](adr/0011-preload.md)). Not implemented: Playwright e2e.
