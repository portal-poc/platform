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

## Design system

- **(found)** `@mui/joy` is still `5.0.0-beta.52` (never reached stable; MUI put Joy in maintenance). Long-term DS base
  needs a decision.

## FSD

- **(found)** Steiger's `repetitive-naming` rejects `task-list` / `task-create` / `task-details` (section 16.2 names);
  pages are `list` / `create` / `details`. The bookmark mutation is used by two pages, so it lives in
  `features/toggle-bookmark`; shared query factories live in `shared/api` (no `entities/task` yet).
