# Delivery: releases, stands and local development

What each stand accepts and how a deploy is started: [`branching.md`](./branching.md).

```
remote repo: Deploy (manual)          registry (git)                      stand (dev3 / dev2 / dev1 / tst)
────────────────────────────          ──────────────                      ────────────────────────────────
stand + ref checked (stands.json)     registry/dev1/tasks.json            /config.json  ← registry build on push
build (+ bridge build)                { version, manifest,                /compat.json  ← host build
verify       (gate 1: contract,         bridgeManifest,                   host reads the manifest (gate 3) →
              singletons, tooling)      basePath, scopes }                  integrated | bridge build | clear error
release stand:  PUT portal-releases/tasks/1.5.3/ (no redeploy)
                gate 2 vs the stand's host ──commit──►  dev1/tasks.json
snapshot stand: gate 2 vs dev3 host → PUT portal-snapshots/dev3/tasks/ (overwrite), entry constant
registry: Promote dev1 → tst ──commit──►  (same artifact, gate against the tst host)
host repo: build → registry check (gate 2, reverse) → deploy host files → registry build
```

Nexus: two raw hosted repositories, the PoC stand-in (`pnpm infra`, :4400) speaks the same API
(`GET|HEAD|PUT /repository/<repo>/<path>`, Basic auth for PUT):

| Repository | Deployment policy | Cache | Content |
|---|---|---|---|
| `portal-releases` | Disable redeploy (PUT of an existing file → 400) | `immutable`, 1 year | `<remote>/<version>/` (+ `bridge/`) |
| `portal-snapshots` | Allow redeploy | `no-cache` (revalidate) | `<stand>/<remote>/` (+ `bridge/`), cleanup policy for old chunks |

## Try it (PoC)

Clone and start everything as in the [README](../README.md) (`pnpm infra`, host deployed to every stand), then from
`tasks-remote` with `PORTAL_REGISTRY_DIR`, `PORTAL_NEXUS_USER`, `PORTAL_NEXUS_PASSWORD` exported (any credentials)
and `cli` = `pnpm dlx @portal-poc/cli@2` (what the pipeline runs):

| Action | Command | What happens |
|---|---|---|
| Snapshot | `git switch develop && cli deploy --stand dev3` | Built as `1.6.0-snapshot.<run>+<sha>`, gated, uploaded over `portal-snapshots/dev3/tasks/`. Registry untouched; reload dev3. |
| Release candidate | `git switch release/1.5 && cli deploy --stand dev1` | `1.5.3-rc.<run>` published, `dev1/tasks.json` written (`--push` commits it). |
| Release tag | `git checkout v1.5.2 && cli deploy --stand dev2` | `1.5.2`, already published → reused, `dev2/tasks.json` written. |
| Wrong line / stand | `cli deploy --stand dev2` on develop, `--stand tst`, `release/1.4` → dev1 | Refused before the build, with the way out. |
| Rollback | `cli release --stand dev1 --version 1.5.2` (or deploy the old tag) | Back through the same gate, nothing rebuilt. |
| Promote | `pnpm promote:tst` in registry | tst gets exactly what dev1 runs. |
| Incompatible build | `DEMO_REQUIRE_ROUTER=^9.0.0 pnpm build && pnpm exec portal-cli verify` | Gate 1 fails. |
| CI bypassed, bridge build exists | `publish` + `release` a build with a conflicting singleton | Gate 2 warns, releases as **isolated**; host loads `tasks_bridge` (status chip: `bridge`). |
| CI bypassed, no bridge build | `rm -rf dist-bridge`, publish/release | Gate 2 blocks; registry unchanged. |
| Host deploy | `pnpm deploy:host dev1` (platform) after `registry check --stand dev1` | A host cannot break the remotes registered on its stand. |

After a registry change run `pnpm deploy` in the registry (the config deploy). `pnpm infra:reset` wipes the PoC
Nexus/stands.

## Local development

| Mode | How | Result |
|---|---|---|
| Standalone remote | `pnpm --filter tasks-remote dev:standalone` | Remote alone with its mock platform — the default loop |
| Local host + local remote(s) | `host/.env.development.local`: `PORTAL_STAND=dev3` + `PORTAL_REMOTE_TASKS=http://localhost:5174/mf-manifest.json`; run `pnpm infra`, the remote's `pnpm dev` and the host's `pnpm dev` | Host + your remote locally with Fast Refresh; every other remote as deployed on dev3 |
| Only local remotes | `PORTAL_STAND=none` + one `PORTAL_REMOTE_*` per remote you run | No infra; the host shows just your remotes |
| New remote, not released yet | `PORTAL_REMOTE_REPORTS=http://localhost:5176/mf-manifest.json` | Works before any registration: route `/reports`, scopes from its own `config.json` |

`local` is not a stand: the registry describes deployed stands only, a developer machine is described by its own
`.env.development.local`.

Deployed stands never load local code. The host toolbar / demo panel shows `name@version · registry|local ·
integrated|bridge|error` for every remote.

## Build tooling

All apps build through `@portal-poc/vite-config` (pinned Vite + MF plugin, MF section of the contract). Manifests record
`pluginVersion`; `verify`, `deploy`/`release` and the host runtime reject unsupported tooling (ADR 0019).
