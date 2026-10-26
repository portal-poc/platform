# Migration plan: from today's portal to the reference model

Scope: the whole move — **how apps share platform code** (architecture track) and **how remotes and the host are
configured, released and loaded** (delivery track). Each problem below names the PoC answer and the phase that
brings it.

## Where we are today

| # | Area | Today (real project) | What it costs | PoC answer |
|---|---|---|---|---|
| 1 | Platform code | Copied into the host and every remote | A host change = a hand update in every repository; copies drift | Versioned packages `@portal-poc/*` (contract, runtime, http, events, ds) from one repository |
| 2 | Quality gates | Lint, fallow, TS configs copied into every remote | Rules drift; nobody knows which repo checks what | `@portal-poc/presets` (oxlint incl. React Compiler rules, fallow, tsconfig, vitest, steiger) + one CI template (`app-ci.yml`) |
| 3 | Build | MF config copied into each build; no exposes contract | A plugin/Vite difference breaks federation in the host; the host guesses what a remote exposes | `@portal-poc/vite-config` (pinned tooling, MF section), fixed exposes checked by `portal-cli verify` (ADR 0019) |
| 4 | Data cache | ONE QueryClient shared by host and remotes; devtools shared only because of it | Real incidents: key prefixes violated, one remote corrupted another's cache | Own QueryClient per app (ADR 0004); devtools through mount functions (ADR 0009); cross-app updates through events, never through a shared cache |
| 5 | HTTP | `useHttp` copy-paste reading copied settings from `window.env` | Hook-only client, global mutable state, the host must know every remote's settings | Each app's own axios bound to the host's login (`@portal-poc/http`, ADR 0022); BFF addresses in the remote's own `config.json` |
| 6 | Realtime | PubSub lives in the host, handed to remotes through `window`; global subscriptions | Coupled to host internals; the backend's per-BFF granular subscriptions have no place to go | Each app's own socket to its BFF with the host's token, topics owned by pages (`@portal-poc/realtime`, ADR 0026) |
| 7 | Versions | Only release branches in git (GitHub flow); stands get whatever was deployed last | No "what runs where", no rollback without a rebuild | Immutable versions per build, registry per stand, commit of every build (ADR 0017, 0020, 0025) |
| 8 | Deploys | By hand to any stand, no validation between host and remotes | Breakage found by users | Same manual Deploy button, but stand rules + three compatibility gates (ADR 0017) |
| 9 | Host config | One JSON per stand **bundled into the host build** | Any config change = host rebuild + deploy | Host reads its stand's `/config.json` at runtime, built from the registry (ADR 0021) |
| 10 | Host upgrades | Every remote follows by hand (copied code, shared singletons) | One upgrade stops every team | Contract versioning + singleton ranges + bridge builds for laggards (ADR 0001, 0002) |
| 11 | Legacy apps | The legacy app had to be rebuilt on the remote stack and a second auth was brought into the host | Weeks of work per legacy app; two logins in one host | MF bridge with its own React/router (legacy runs React 18 in the PoC); the host's token for the legacy BFF, exchanged on-behalf-of server-side (ADR 0027, phase A6) |
| 12 | Config isolation | The host holds the env settings of **every** remote — BFF base URLs, the URLs remote assets load from — and hands them out through `window.env`: one central configuration | A remote cannot add or change a setting without a host change and deploy; remotes are not isolated (a wrong central value breaks someone else's app); the host team is in every remote's path | The remote owns its configuration: `public/config.json` per environment, shipped inside its own version folder and picked by `platform.env.name`. The host knows only what the registry says it needs: manifest URL, route, scopes. Asset URLs follow the manifest (`publicPath: auto` → the version folder in Nexus), never a host setting |

## Target (what the PoC shows)

Manual Deploy (stand + ref) as today · immutable versioned artifacts on the testers' stands, a snapshot stand for
developers · registry per stand for remotes and the host (commit = release, deploy an old tag = rollback) · host
config read at runtime · remotes own their config · three compatibility gates · bridge builds as a safety net ·
versions and commits in telemetry · one-command local development modes · shared platform code as versioned
packages, never copies.

## Phases

**Approximate.** Written from the PoC and from how the real project was described, without access to its codebase:
the phases, their order and their dependencies are the proposal; no time estimates. They come after the real code has
been looked at together with the teams.

| # | Phase | What changes | Unlocks |
|---|---|---|---|
| 1 | **Host reads its stand config at runtime** | `/config.json` fetched before render; remotes registered with `registerRemotes` from it; a tiny "deploy config" job per stand copies the stand file next to the host | Config changes without host rebuild. **Prerequisite for everything else.** |
| 2 | **Immutable versioned publishing** | The manual deploy pipeline keeps its "stand + branch" inputs; release stands get `portal-releases/<name>/<version>/` (never overwritten), dev3 keeps overwriting in `portal-snapshots/dev3/<name>/` (ADR 0020); the stand config points at the manifest URLs | Rollback by pointer, no broken open tabs, correct caching, "what runs where" |
| 3 | **Registry + deploy rules** | `registry/<stand>/<remote>.json` in its own repository + `stands.json` (what each stand accepts); the deploy pipeline (`portal-cli deploy`) refuses wrong stand/branch pairs and commits the entry with a pipeline identity (a GitHub App / service account; the PoC uses a deploy key); hand edits via PR + CODEOWNERS; a change triggers the config deploy | Audited releases without the host team; rollback = deploy the previous tag |
| 4 | **Compatibility gates** | Host build emits `compat.json`; `release` checks the stand's host; host deploy runs `registry check`; host checks manifests at runtime | Incompatible releases blocked before users see them |
| 5 | **Remotes own their config** (problem #12) | `config.json` inside the remote's version folder, validated by zod; stand name from the platform contract (`platform.env`); a transition helper falls back to `window.env` with a deprecation warning; then `window.env` is removed | Host no longer knows remote settings. *Depends on the remote receiving the platform contract as a prop (architecture track) — until then the helper can read the stand name from `window.env`.* |
| 6 | **Local development** | Standalone mode for every remote; host dev server builds `/config.json` from `PORTAL_STAND` + `PORTAL_REMOTE_*` (`.env.development.local`); Fast Refresh of local remotes inside the host (recording DevTools hook, refresh runtime + Vite client attach) | Work on one remote against what is really deployed, without running every app |
| 6a | **Build preset (tooling as a build-time singleton)** | `@portal-poc/vite-config` owns the MF section and pins Vite + MF plugin; manifests carry `pluginVersion`; `verify`/`release`/host runtime reject unsupported tooling | A remote can no longer break federation in the host with another bundler/plugin version |
| 7 | **Observability** | Telemetry tagged `name@version`, remote status in the toolbar, `registry status` dashboard (or a page generated from the registry) | Fast triage: which version, which mode, which stand |
| 8 | **Bridge builds** (when the first singleton major upgrade is planned) | Second build target without shared deps per remote; registry carries `bridgeManifest` | Host can upgrade React/router/DS majors without stopping laggards |
| 9 | **Versioned host** | The host follows the same stand rules: `portal-releases/host/<version>/`, `<stand>/_host.json`, installed by the config deploy, promoted with the remotes (ADR 0025) | Host rollback without rebuild; "which host runs on tst" answered |
| 10 | **Housekeeping** | Snapshot/host folders cleaned by the deploy after a day; tabs on a cleaned build reload once (ADR 0021); every build records its commit | No Nexus growth, no broken long-lived tabs, reproducible bug investigations |

Phase 8 is scheduled with the first singleton major upgrade.

## Architecture track: shared code as packages, not copies

| # | Phase | What changes | Removes (problem #) |
|---|---|---|---|
| A1 | **Packages + templates** | Platform code moves into versioned packages in an internal npm scope on Nexus (contract, runtime, http, events, ds, mf-shared, vite-config, presets, cli); one CI template; `portal-cli create remote` for new apps | 1, 2, 3 |
| A2 | **Contract via props + own QueryClient** | The host passes `platform` to `RemoteRoot`; each app creates its QueryClient (prefixes become irrelevant), registers its devtools panel | 4, part of 10 |
| A3 | **HTTP through `@portal-poc/http`** | Each app's axios bound to the host's login; BFF addresses and scopes from the remote's `config.json`; `window.env` reads removed (fallback helper during the transition) | 5, 12, part of 9 |
| A4 | **Realtime per app** | The host's pubsub leaves `window`: each remote opens ITS socket to ITS BFF with `@portal-poc/realtime` (token from the host's login, topics subscribed by pages, reconnect); the host's channel stays for apps not migrated yet (ADR 0026) | 6 |
| A5 | **Cross-app UX** | Event catalog (ADR 0023), leave guards and page titles (ADR 0024), preload on hover (ADR 0011) | ad-hoc `window` hooks between apps |
| A6 | **Legacy through the bridge** | Legacy apps keep their stack (own React/router in an MF bridge); they get the host's token for their BFF audience, and the legacy BFF exchanges it (on-behalf-of) for the legacy auth's token — no second login in the host | 11 |

Order: A1 first (it
makes every later change a dependency bump instead of a copy), then A2 (the cache incidents), A3, A4 with the
backend's subscription work; A6 when the next legacy app comes.



## Order and quick wins

0. **A1** (packages + templates) can start at once and runs in parallel: every later change becomes a version bump.
1. **Phase 1** first on the delivery side — nothing else helps while configs are bundled into the host.
2. **Phase 2** right after — the biggest operational win (rollback, cache, open tabs) and independent of the rest.
3. Phases 3–4 together (the registry PR is where the gate runs).
4. Phase 6a early — it is cheap and protects the host from tooling drift while teams are still few.
5. Phase 5 per remote, opportunistically; phases 6–7 any time after phase 1.
6. **A2** as soon as A1 lands — it removes the class of cache incidents for good; A3 together with phase 5 (both
   remove `window.env`).

## Backend track: remote frontend ↔ its BFF

Every remote frontend has its own BFF (separate repositories, today deployed manually, independently of the
frontend). Before the first production release this mismatch is harmless; after it, a frontend can expect fields an
older BFF does not return (strict zod validation then fails the screen) and a BFF can drop what an older frontend or
a rollback still needs.

**Now (cheap, no gates):**
- The http client sends `X-Client-Version: <name>@<version>` (implemented in `@portal-poc/http`, `attachPlatformAuth`); BFFs log it.
- BFFs expose their API version (response header or `/.well-known/api-version`).
- Tolerant reader in zod schemas: no `.strict()`, new fields optional until every stand's BFF has them.

**Before the first production release:**
- Rules: expand → migrate → contract; BFF deploys before the frontend that needs it; breaking change = new API
  version, never an in-place change; a compatibility window (the BFF supports frontends released in the last N
  releases/weeks — covers rollbacks and long-lived tabs).
- Frontend build records the API version it expects (from the OpenAPI package of the backend specs repo) in its
  manifest; `portal-cli release` checks it against the BFF version on the target stand (same gate as singletons).
- BFF answers `426 Upgrade Required` to frontends outside its window; the frontend shows "a new version is
  available — reload".
- Automated BFF deployments (otherwise there is nothing reliable to check against); versions dashboard shows the
  frontend/BFF pair per stand.

Order: the "now" part can start with any BFF; the gate needs automated BFF deploys first.

## Rollout without a big bang

- **Pilot**: one remote on `dev3` moves to versioned publishing + registry; the others keep their stable URLs. Both
  forms are just a manifest URL in the stand config, so the host supports them at the same time.
- **Stands in order**: dev3 → dev2 → dev1 → tst (prod later). dev3 auto-merges on a green gate; tst only accepts
  promotions from dev1 with business approval (see [`branching.md`](./branching.md)).
- **Exit criteria per remote**: publishes immutable versions, released only through the registry, `verify` green in
  CI, no `window.env` reads (telemetry shows no fallback warnings).
- **Rollback of the migration itself**: point the stand config back at the old stable URL — the host logic does not
  care where a manifest comes from.

## Risks

| Risk | Mitigation |
|---|---|
| Teams bypass the pipeline and copy files to Nexus | Nexus write access only for the platform pipeline template ("Required template" check on the service connection); the registry gate still runs on the PR |
| PR noise in the registry | One file per remote per stand, auto-complete on green gate + owner approval |
| Version skew in long-lived tabs (old host, new remote) | Contract support window (N-1), runtime manifest check, bridge builds; a tab whose chunks were cleaned up reloads once (ADR 0021) |
| Packages slow teams down ("wait for a platform release") | Additive-only contract, small packages released independently, `portal-cli create` and the CI template keep teams on the paved road; a team may pin and upgrade on its own schedule within the supported ranges |
| Two migrations at once (architecture + delivery) | They are independent: A1–A3 change code inside apps, phases 1–4 change pipelines; one pilot remote goes through both first |
| CSP when adding remotes | Serve all remotes from one Nexus/CDN origin (path per remote) so the CSP never changes |
| Bridge builds double the remote CI time | Build the bridge variant only on release branches, or only after a singleton major is announced |
