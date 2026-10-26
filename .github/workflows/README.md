# Central workflows

The platform's pipelines, called by every app repository with a pinned tag (`@v2`) — the GitHub counterpart of an
Azure DevOps `extends: template`. Callers stay a few lines; a pipeline change is made once here and reaches every app
when the tag moves (`git tag -f v2 <sha> && git push -f origin v2`, platform team only).

| Workflow | Called by | Trigger in the caller | What it does |
|---|---|---|---|
| [`app-ci.yml`](app-ci.yml) | host, remotes, registry (`ci.yml`) | push to trunk / `release/**`, PRs | install → `typecheck` → `lint` → `test` → `build` → `verify` (integration contract) → `validate` (registry) → `migrate --check` (warning only). Checks only. |
| [`deploy.yml`](deploy.yml) | remotes (`deploy.yml`, the **Deploy** button) | `workflow_dispatch`: `stand`, `ref`, first deploy: `base-path`, `scopes`; `mode` | `portal-cli deploy`: stand rules → build → gate vs the stand's host → upload to Nexus → registry commit. Details below. |
| [`deploy-host.yml`](deploy-host.yml) | host (`deploy.yml`) | `workflow_dispatch`: `stand`, `ref` | `portal-cli host deploy`: same stand rules, reverse gate (every remote on the stand vs the new host), snapshot install or publish + `<stand>/_host.json`. |
| [`forward-merge.yml`](forward-merge.yml) | host, remotes (`ci.yml`) | push to `release/X.Y` | Opens the PR `release/X.Y → next line` (… → trunk) unless already merged or open. Merge it with a merge commit. |
| [`release.yml`](release.yml) | this repository | tag `v*`, manual | Builds and publishes every `@portal-poc/*` package whose version is not in GitHub Packages yet. |
| [`ci.yml`](ci.yml) | this repository | push to main, PRs | `pnpm check` (typecheck, lint, test, build) for all packages. |

## Calling them

```yaml
# .github/workflows/ci.yml of an app
jobs:
  ci:
    uses: portal-poc/platform/.github/workflows/app-ci.yml@v2
    secrets: inherit
  forward-merge:
    if: startsWith(github.ref, 'refs/heads/release/')
    uses: portal-poc/platform/.github/workflows/forward-merge.yml@v2

# .github/workflows/deploy.yml of a remote
on:
  workflow_dispatch:
    inputs:
      stand: { type: choice, options: [dev3, dev2, dev1] }
      ref: { default: develop }
jobs:
  deploy:
    uses: portal-poc/platform/.github/workflows/deploy.yml@v2
    with: { stand: '${{ inputs.stand }}', ref: '${{ inputs.ref }}' }
    secrets: inherit
```

`portal-cli create remote` generates both files.

## Deploy, step by step

```
Deploy(stand, ref)
  1 rules      registry stands.json: dev3 any ref · dev2 newest release/X.Y or its tag · dev1 pinned line · tst never
               refused here, before anything is built, with a hint (e.g. "portal-cli stand switch")
  2 version    snapshot: <package.json>-snapshot.<run>+<sha> · release/X.Y: X.Y.<next>-rc.<run> · vX.Y.Z: X.Y.Z
  3 build      pnpm build (PORTAL_APP_VERSION set) → dist/ + dist-bridge/; verify both
  4 gate       manifest vs the compat.json of the host deployed on that stand (singletons, contract, tooling)
  5 upload     Nexus: remoteEntry.js and chunks first, mf-manifest.json last (atomic switch for open tabs)
               snapshot → portal-snapshots/<stand>/<remote>/ (overwritten) · release → portal-releases/<remote>/<version>/ (immutable, reused)
  6 registry   release stands: commit <stand>/<remote>.json → Config deploy → <stand>/config.json, live on next page load
```

The CLI is `pnpm dlx @portal-poc/cli@2`: today's rules apply to any ref, an old tag included. The app's own `build`
and `verify` scripts come from the ref.

## What a repository needs

| | Where | For |
|---|---|---|
| Read access to the `@portal-poc` packages | each package → Package settings → Manage Actions access | `pnpm install` in every workflow (403 otherwise) |
| `PORTAL_NEXUS_USER`, `PORTAL_NEXUS_PASSWORD` | repository / org secrets | uploads (deploy) |
| `PORTAL_REGISTRY_SSH_KEY` (or `PORTAL_REGISTRY_TOKEN`) | repository / org secrets | registry commits (deploy) |
| "Allow GitHub Actions to create and approve pull requests" | org / repository settings | forward-merge PRs |

All scenarios end to end, with diagrams: [`docs/playbook.md`](../../docs/playbook.md).
