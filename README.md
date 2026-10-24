# platform

Portal micro-frontend platform (PoC, organisation [`portal-poc`](https://github.com/portal-poc)). Requirements:
[`PORTAL_MFE_CONTEXT.md`](./PORTAL_MFE_CONTEXT.md). Architecture and decisions: [`docs/`](./docs) (start with
[`architecture.md`](./docs/architecture.md), [`delivery.md`](./docs/delivery.md),
[`migration-plan.md`](./docs/migration-plan.md), [`adr/`](./docs/adr)).

## Repositories

| Repository | What | Owner in reality |
|---|---|---|
| **platform** (this) | `@portal-poc/*` packages, PoC infrastructure, docs | platform team |
| [host](https://github.com/portal-poc/host) | Portal host | host team |
| [tasks-remote](https://github.com/portal-poc/tasks-remote) | Remote "tasks" (FSD 2.1) | product team |
| [legacy-remote](https://github.com/portal-poc/legacy-remote) | React 18 remote via MF Bridge | another team |
| [registry](https://github.com/portal-poc/registry) | Which remote version runs on which stand (release = PR) | platform + teams (CODEOWNERS) |

## Packages (GitHub Packages, `@portal-poc` scope)

| Package | Role |
|---|---|
| `@portal-poc/platform-contract` | Types only + `PLATFORM_CONTRACT_VERSION` |
| `@portal-poc/platform-runtime` | Provider, auth adapters, http client, QueryClient factory, devtools, standalone, compat |
| `@portal-poc/ds` | Design system (MF singleton) + loading primitives |
| `@portal-poc/mf-shared` | Integration contract constants: exposes, singletons, supported ranges, compat checks |
| `@portal-poc/vite-config` | Build preset: pinned Vite + MF plugin, MF section, React Compiler |
| `@portal-poc/presets` | tsconfig, oxlint (incl. React Compiler rules), fallow, vitest, steiger |
| `@portal-poc/cli` (`portal-cli`) | `create remote`, `add`, `verify`, `publish`, `release --pr`, `registry …` |

Release: bump versions → run the **Release packages** workflow (or push a `v*` tag). Versions are immutable.

CI of every app repository calls the central reusable workflow
[`app-ci.yml`](./.github/workflows/app-ci.yml) pinned to `@v1` (GitHub counterpart of an Azure DevOps template).
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
3. **Infrastructure** (PoC Nexus :4400, stands uat :4501 / prod :4502) — keep running:
   ```sh
   cd platform && pnpm infra
   ```
4. **Local development** (host + the remotes you work on, everything else as deployed on uat). Local setup lives
   only in `host/.env.development.local` (copy the `.example`), never in the registry:
   ```sh
   cd tasks-remote && pnpm dev         # :5174, listed as PORTAL_REMOTE_TASKS
   cd ../host && pnpm dev              # :5173 → http://localhost:5173
   ```
   `PORTAL_STAND=none` = only your local remotes, no infra needed. Or a remote standalone:
   `cd tasks-remote && pnpm dev:standalone`.
5. **Release flow on the uat stand** (production builds, immutable artifacts, gates, registry PR):
   ```sh
   cd host && pnpm build && cd ../platform && pnpm deploy:host uat
   export PORTAL_NEXUS_DIR=~/projects/portal-poc/platform/.infra/nexus PORTAL_REGISTRY_DIR=~/projects/portal-poc/registry
   cd ../tasks-remote && pnpm release:uat        # opens a PR in portal-poc/registry
   # merge the PR, then:
   cd ../registry && git pull && pnpm deploy:uat
   open http://localhost:4501
   ```
