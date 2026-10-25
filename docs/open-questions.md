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

- **(decided, ADR 0026)** One socket per BFF opened by the remote (`@portal-poc/realtime`, opt-in, not in the
  contract), token in the first frame, topics owned by pages, thin events. **Open with the backend:** the frame
  protocol and close codes of the real BFF sockets, topic naming and who authorizes a topic (the BFF, from the
  token), how long the BFF keeps a subscription after a reconnect.

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

## Auth

- **(open)** Impersonation: the host adds a header next to the bearer token for every non-legacy request; design in
  ADR 0022 (`platform.auth.getRequestHeaders`, full reload on change), not implemented. The BFF must authorize
  impersonation from the token, never trust the header alone.
- **(open)** Legacy apps (migration phase A6): the bridge app gets the host's token for its BFF's audience; the
  legacy BFF exchanges it on-behalf-of for the legacy auth's token. Needs the legacy auth to accept the exchange
  (app registration, consent) — a backend decision.

## Delivery

- **(found)** Singleton provider: verified that MF keeps an already loaded singleton; the host now preloads all
  contract singletons before remotes register (ADR 0001). If the host ever lazy-loads a large shared singleton, keep
  it in that preload or accept that the first loader's copy wins.

- **(resolved)** Registry is its own repository (`portal-poc/registry`); a small service only if PR volume grows.
- **(resolved)** Registry writes from pipelines: the manual Deploy workflow commits to the registry's main (`--push`)
  with a deploy key (`PORTAL_REGISTRY_SSH_KEY`), so its pushes trigger the Config deploy; `--pr` remains for changes
  that need an approval (ADR 0020, 0021). Production: a GitHub App token instead of the key.
- **(resolved)** `portal-cli publish` uploads over the Nexus raw API (PUT with credentials); `portal-releases`
  refuses redeploy on the server side, `portal-snapshots` allows it for dev3 (ADR 0020). Old files of overwritten
  folders are deleted by the next deploy after a day; tabs on such a build reload once (ADR 0021).
- **(found)** Host release lines: the host's `release/1.5`–`1.7` were cut from one commit (one host serves every
  line today). When the host diverges per line, fixes follow the forward-merge rules like the remotes (ADR 0025).
- **(found)** Event catalog ownership at scale: who approves a new event in `@portal-poc/events` and how stands are
  checked before an old event version is removed (today: by hand, ADR 0023).
- **(found)** Remote frontend ↔ BFF compatibility is not enforced yet (BFFs deployed manually, no prod). Plan in
  `migration-plan.md` → "Backend track".
- **(found)** Upgrading Vite / the MF plugin needs a transition window where the host's MF runtime loads manifests of
  both versions (widen `SUPPORTED_BUILD_TOOLING` first). Not exercised in the PoC.

## Tooling

- **(found, fixed)** Polyrepo dry run findings (dependency confusion with public `portal-cli`, TS-only packages,
  hoisted `@types/node`, live linter configs inside the published CLI, statically imported optional peer) — see
  [`polyrepo.md`](./polyrepo.md).
- **(found)** Nexus setup: internal scope `@portal-poc` must be hosted-only (never proxied from npmjs) and "disable
  redeploy" on; developer onboarding pins `@portal-poc:registry` in `~/.npmrc`.
- **(found)** pnpm 12 asks to approve "agent skills" shipped by dependencies (`fallow`); CI policy needed.
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
