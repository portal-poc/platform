# Delivery: releases, stands and local development

Which branch feeds which stand: [`branching.md`](./branching.md).

```
remote repo CI                        registry (git)                      stand (dev3 / dev2 / dev1 / tst)
──────────────                        ──────────────                      ────────────────────────────────
build (+ bridge build)                registry/dev1/tasks.json            /config.json  ← registry build on merge
verify       (gate 1: contract,       { version, manifest,                /compat.json  ← host build
              singletons, tooling)      bridgeManifest,                   host reads the manifest (gate 3) →
publish → nexus/tasks/1.4.2/            basePath, scopes }                  integrated | bridge build | clear error
release --auto (gate 2) ──PR──►       branch policy: gate +
                                       stand owner approval → merge
promote --from dev1 --to tst ──PR──►  (same artifact, gate against the tst host)
host repo CI: build → registry check (gate 2, reverse) → deploy host files → registry build
```

## Try it (PoC)

Clone and start everything as in the [README](../README.md) (`pnpm infra`, host deployed to every stand), then from
`tasks-remote` (with `PORTAL_NEXUS_DIR` / `PORTAL_REGISTRY_DIR` exported):

| Action | Command | What happens |
|---|---|---|
| New version of a line | `PORTAL_APP_VERSION=1.4.1 pnpm release` | Built, verified, published as `tasks/1.4.1/`; PR to the stands following `release/1.4` (dev1). Merge, `pnpm deploy` in registry: dev1 runs `tasks@1.4.1`, host untouched. |
| Rollback | `pnpm exec portal-cli release --stand dev1 --version 1.4.0 --pr` | Back to 1.4.0 through the same gate (or revert the registry PR). |
| Promote | `pnpm promote:tst` in registry | tst gets exactly what dev1 runs. |
| Incompatible build | `DEMO_REQUIRE_ROUTER=^9.0.0 pnpm build && pnpm exec portal-cli verify` | Gate 1 fails. |
| CI bypassed, bridge build exists | build/publish/release `PORTAL_APP_VERSION=1.4.90` with a conflicting singleton | Gate 2 warns, releases as **isolated**; host loads `tasks_bridge` (status chip: `bridge`). |
| CI bypassed, no bridge build | `rm -rf dist-bridge`, publish/release `1.4.91` | Gate 2 blocks; registry unchanged. |
| Host deploy | `pnpm deploy:host dev1` (platform) after `registry check --stand dev1` | A host cannot break the remotes registered on its stand. |

`pnpm infra:reset` wipes the PoC Nexus/stands (artifacts are immutable, so re-running a release needs a new version).

## Local development

| Mode | How | Result |
|---|---|---|
| Standalone remote | `pnpm --filter tasks-remote dev:standalone` | Remote alone with its mock platform — the default loop |
| Local host + local remote(s) | `host/.env.development.local`: `PORTAL_STAND=dev3` + `PORTAL_REMOTE_TASKS=http://localhost:5174/mf-manifest.json`; run `pnpm infra`, the remote's `pnpm dev` and the host's `pnpm dev` | Host + your remote locally with Fast Refresh; every other remote at the version registered on dev3 |
| Only local remotes | `PORTAL_STAND=none` + one `PORTAL_REMOTE_*` per remote you run | No infra; the host shows just your remotes |
| New remote, not released yet | `PORTAL_REMOTE_REPORTS=http://localhost:5176/mf-manifest.json` | Works before any registration: route `/reports`, scopes from its own `config.json` |

`local` is not a stand: the registry describes deployed stands only, a developer machine is described by its own
`.env.development.local`.

Deployed stands never load local code. The host toolbar / demo panel shows `name@version · registry|local ·
integrated|bridge|error` for every remote.

## Build tooling

All apps build through `@portal-poc/vite-config` (pinned Vite + MF plugin, MF section of the contract). Manifests record
`pluginVersion`; `verify`, `release` and the host runtime reject unsupported tooling (ADR 0019).
