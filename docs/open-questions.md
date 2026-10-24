# Open questions

Items marked **(from requirements)** come from section 23 of `PORTAL_MFE_CONTEXT.md`. Items marked **(found)** were
discovered while building this reference repo. Code that depends on an open decision carries `TODO(decision)`.

## Platform policy

- **(from requirements)** React/DS version policy: who upgrades first (host), deadline for remotes, what happens to
  laggards (automatic bridge or block).
- **(from requirements)** Admission criteria for bridge remotes and who approves them.
- **(from requirements)** DS singleton vs stack freedom: move the Joy theme to CSS variables so visual consistency rests
  on tokens rather than on a shared DS major?
- **(from requirements)** Contract versioning: additive-only changes, or explicit support of several `contractVersion`
  values by the host.
- **(from requirements)** Do we need `portal-cli doctor` / codemods for contract changes?

## Realtime

- **(found)** Realtime is out of scope for this PoC (existing WebSocket pub/sub in the real project). When adapting:
  decide how the existing pub/sub maps to "one connection per application" and "thin events → each app invalidates its
  own keys" (section 12 of the requirements), and whether the local bus fast path stays.

## Build / Module Federation

- **(from requirements)** `singleton` / `strictVersion` behaviour of the chosen Vite MF plugin and whether
  `query-client.ts` lands in one shared chunk for both `./preload` and `./RemoteRoot`.
- **(from requirements)** Status of `@tanstack/react-devtools` (was alpha) — current decision: own toolbar, no dependency
  on the alpha shell.
- **(found)** `@module-federation/bridge-react@2.9.2` declares `react-router` peer `^6 || ^7`; React Router v8 removed
  `react-router-dom`. The host therefore uses the router-agnostic entry `@module-federation/bridge-react/base` and passes
  `basename` explicitly. Bridge remotes bring their own router (v7 in `legacy-remote`).

## API contracts

- **(from requirements)** Final home of generated API code (package from the specs repo is preferred). Out of scope
  for this PoC by decision of the project owner.

## Delivery

- **(found)** Registry as a folder vs. its own repository vs. a small service — start as a folder in the host repo,
  move out when PR volume grows.
- **(found)** PR automation from remote pipelines (service account, ADO REST) is described but not implemented in the
  PoC; `portal-cli release` writes the entry locally.
- **(found)** `portal-cli publish` copies to a folder; real Nexus upload (raw repository, PUT with credentials, refuse
  overwrite on the server side) is a TODO(decision).
- **(found)** Remote dev servers inside a deployed host get page reloads, not Fast Refresh (production React).

## Tooling

- **(found)** `portal-cli` runs TypeScript via Node type stripping inside the monorepo; publishing to Nexus needs a JS
  build (Node does not strip types under `node_modules`).
- **(found)** oxlint has no port of `react-hooks/component-hook-factories`; add `eslint-plugin-react-hooks` as an
  oxlint JS plugin (aliased name) if needed.
- **(found)** Standalone MSAL mode (own PCA from `config.json`) is left as `TODO(decision)` in the remote.

## Design system

- **(found)** `@mui/joy` is still `5.0.0-beta.52` (never reached stable; MUI put Joy in maintenance). Long-term DS base
  needs a decision.

## FSD

- **(found)** Steiger's `repetitive-naming` rejects `task-list` / `task-create` / `task-details` (section 16.2 names);
  pages are `list` / `create` / `details`. The bookmark mutation is used by two pages, so it lives in
  `features/toggle-bookmark`; shared query factories live in `shared/api` (no `entities/task` yet).
- **(found)** `react-router/dom` must be shared as a singleton too: it carries its own copy of the router internals,
  so a remote `RouterProvider` and shared `<Routes>` otherwise see different contexts (broke bridge mode).
- **(found)** Route elements need a `key` per route for page-level `<ViewTransition>` enter/exit: without it React
  reconciles them as an update of one component.
- **(found)** With React Compiler, components passed to `react-error-boundary` as `fallbackRender` break (hooks in a
  plain function call); pass `FallbackComponent` instead.
