# platform

Portal micro-frontend platform (PoC, organisation [`portal-poc`](https://github.com/portal-poc)). Original requirements:
[`PORTAL_MFE_CONTEXT.md`](./PORTAL_MFE_CONTEXT.md) (deviations: architecture.md and the ADRs). Architecture and decisions: [`docs/`](./docs) (start with
[`architecture.md`](./docs/architecture.md), [`delivery.md`](./docs/delivery.md),
[`migration-plan.md`](./docs/migration-plan.md), [`adr/`](./docs/adr)).

## Repositories

| Repository | What | Owner in reality |
|---|---|---|
| **platform** (this) | `@portal-poc/*` packages, reusable workflows, docs | platform team |
| [host](https://github.com/portal-poc/host) | Portal host | host team |
| [tasks-remote](https://github.com/portal-poc/tasks-remote) | Remote "tasks" (FSD 2.1) | product team |
| [legacy-remote](https://github.com/portal-poc/legacy-remote) | React 18 remote via MF Bridge | another team |
| [registry](https://github.com/portal-poc/registry) | Which remote version runs on which stand (release = PR) | platform + teams (CODEOWNERS) |

## Packages (GitHub Packages, `@portal-poc` scope)

| Package | Role |
|---|---|
| `@portal-poc/platform-contract` | Types only + `PLATFORM_CONTRACT_VERSION` |
| `@portal-poc/platform-runtime` | Provider, auth adapters, QueryClient factory, event bus, leave guards + page titles (`/router`: the router blocker), devtools, standalone, compat, stale-tab reload |
| `@portal-poc/http` | axios bound to the host's login: `attachPlatformAuth`, `createPlatformBinding`, `parseResponse` (no React) |
| `@portal-poc/events` | Event catalog of the local bus: owners, zod payloads, `publishEvent` / `subscribeEvent` (no React) |
| `@portal-poc/ds` | Design system (MF singleton) + loading primitives |
| `@portal-poc/mf-shared` | Integration contract constants: exposes, singletons, supported ranges, compat checks |
| `@portal-poc/vite-config` | Build preset: pinned Vite + MF plugin, MF section, React Compiler |
| `@portal-poc/presets` | tsconfig, oxlint (incl. React Compiler rules), fallow, vitest, steiger |
| `@portal-poc/cli` (`portal-cli`) | `create remote`, `add`, `verify`, `deploy`, `host deploy`, `promote`, `stand switch`, `registry …` ([README](./packages/portal-cli/README.md)) |

Release: bump versions → run the **Release packages** workflow (or push a `v*` tag). Versions are immutable.

CI of every app repository calls the central reusable workflow
[`app-ci.yml`](./.github/workflows/app-ci.yml) pinned to `@v2` (GitHub counterpart of an Azure DevOps template).
Each `@portal-poc` package grants Read access to the app repositories (package settings → Manage Actions access).

## Run everything on one machine

1. **Token for packages** (classic PAT or `gh auth refresh -s read:packages`), then in `~/.npmrc` — it must be the
   user-level file: pnpm does not expand env vars in a repository's `.npmrc` credentials:
   ```sh
   @portal-poc:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=<token>
   ```
2. **Clone side by side**:
   ```sh
   mkdir -p ~/projects/portal-poc && cd ~/projects/portal-poc
   for repo in platform registry host tasks-remote legacy-remote; do gh repo clone portal-poc/$repo; done
   for repo in platform registry host tasks-remote legacy-remote; do (cd $repo && pnpm install); done
   ```
3. **Infrastructure** is hosted ([ADR 0021](docs/adr/0021-hosted-poc-stands.md)): Nexus
   https://nexus.poc.ashirokov.dev, stands https://dev3.poc.ashirokov.dev (dev2, dev1, tst). Nothing to start locally.
4. **Local development** (host + the remotes you work on, everything else as deployed on dev3: the host dev server
   reads the stand's `/config.json`). Local setup lives only in `host/.env.development.local` (copy the `.example`),
   never in the registry:
   ```sh
   cd tasks-remote && pnpm dev         # :5174, listed as PORTAL_REMOTE_TASKS
   cd ../host && pnpm dev              # :5173 → http://localhost:5173
   ```
   `PORTAL_STAND=none` = only your local remotes. Or a remote standalone: `cd tasks-remote && pnpm dev:standalone`.
5. **Deploy flow** (manual: stand + ref, see [`docs/branching.md`](docs/branching.md)) — in GitHub, Actions →
   **Deploy** → Run workflow:
   - `host`: stand + ref → the host build on that stand (after `registry check`);
   - `tasks-remote` / `legacy-remote`: stand + ref → snapshot on dev3, a release on dev2 / dev1 (registry commit);
   - `registry`: **Promote** dev1 → tst; every registry change is uploaded to the stands by **Config deploy**.

   Then reload https://dev3.poc.ashirokov.dev (or dev2 / dev1 / tst). `pnpm status` in `registry` shows what runs
   where.
