# Delivery: releases, stands and local development

```
remote repo CI                     registry (git)                       stand (uat/prod)
───────────────                    ──────────────                       ────────────────
build (+ bridge build)             registry/uat/tasks.json              /config.json  ← registry build (on merge)
verify  (gate 1)                   { version, manifest,                 /compat.json  ← host build
publish → nexus/tasks/1.4.2/         bridgeManifest, basePath, scopes } host loads manifest → gate 3 → integrated |
release --stand uat (gate 2) ──PR──►  branch policy: gate + owner        bridge build | clear error
                                       approval → merge → config deploy
host repo CI: build → registry check (gate 2, reverse) → deploy host files → registry build
```

## Try it (PoC)

```sh
pnpm install
pnpm infra                     # terminal 1: Nexus :4400, stands uat :4501, prod :4502
pnpm demo:uat                  # terminal 2: deploy host to uat + release tasks & legacy (0.1.0)
open http://localhost:4501     # uat stand (production builds from Nexus)
pnpm registry:status           # versions dashboard
```

| Action | Command (from `apps/tasks-remote`) | What happens |
|---|---|---|
| New version | `pnpm build && pnpm exec portal-cli publish --nexus-dir ../../.infra/nexus --version 0.2.0 && pnpm exec portal-cli release --stand uat --registry ../../registry --version 0.2.0` | Gate passes, `registry/uat/tasks.json` changes (= the PR). Then `pnpm exec portal-cli registry build --stand uat --registry ../../registry --out ../../.infra/stands/uat/config.json` (= config deploy on merge). Reload uat: `tasks@0.2.0`, host untouched. |
| Rollback | `pnpm exec portal-cli release --stand uat --registry ../../registry --version 0.1.0` + registry build | Back to 0.1.0 in seconds, through the same gate. |
| Incompatible build | `DEMO_REQUIRE_ROUTER=^9.0.0 pnpm build && pnpm exec portal-cli verify` | Gate 1 fails. |
| CI bypassed, bridge build exists | publish `--version 0.3.0`, release `--version 0.3.0` | Gate 2 warns, releases as **isolated**; host loads `tasks_bridge` (status chip: `bridge`). |
| CI bypassed, no bridge build | `rm -rf dist-bridge`, publish/release `0.3.1` | Gate 2 blocks; registry unchanged. |
| Host deploy | `pnpm deploy:host:uat` (repo root) | `registry check` against the NEW host compat.json first: a host cannot break registered remotes. |

`pnpm infra:reset` wipes the PoC Nexus/stands (artifacts are immutable, so re-running a release needs a new version).

## Local development

| Who | Command | Result |
|---|---|---|
| Remote team, quick loop | `pnpm --filter tasks-remote dev:standalone` | Remote alone with mock platform |
| Remote team, inside the real host | `pnpm --filter tasks-remote dev:in-uat` → open the printed URL | uat host + uat remotes + YOUR dev server; save → reload |
| Host team | `pnpm dev:host:uat` (with `pnpm infra`) | Local host (HMR) + remotes registered on uat |
| Everything local | `pnpm dev` | Local stand: host + remotes on dev servers, Fast Refresh for remote components inside the host |

The host toolbar / demo panel shows `name@version · registry|override · integrated|bridge|error` for every remote.
