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
host repo: Deploy (stand + ref) → build → registry check (gate 2, reverse) → PUT portal-stands/<stand>/host/
```

Nexus (hosted: `https://nexus.poc.ashirokov.dev`, [ADR 0021](./adr/0021-hosted-poc-stands.md)): raw hosted
repositories (`GET|HEAD|PUT /repository/<repo>/<path>`, Basic auth for PUT; uploads only from the deploy pipelines):

| Repository | Deployment policy | Cache | Content |
|---|---|---|---|
| `portal-releases` | Disable redeploy (PUT of an existing file → 409) | `immutable`, 1 year | `<remote>/<version>/` (+ `bridge/`) |
| `portal-snapshots` | Allow redeploy | `no-cache` (revalidate) | `<stand>/<remote>/` (+ `bridge/`) |
| `portal-stands` | Allow redeploy | set by the stand's nginx | `<stand>/host/` (host build), `<stand>/config.json` (registry) |

**Overwritten folders are cleaned by the next deploy**: after uploading a snapshot or a host, `portal-cli` deletes the
files of earlier builds in that folder that are older than a day (the deploy user may delete only in
`portal-snapshots` and `portal-stands`). A tab still running an older build can then miss a chunk: the host catches
the failed load (`installStaleBuildRecovery`, `isStaleBuildError` in `platform-runtime`) and reloads the page once onto
the current builds; a second failure within a minute is shown as an error instead of looping.

## Try it (PoC)

Everything starts from a button: GitHub → the repository → Actions → workflow → **Run workflow**. Watch the result on
`https://<stand>.poc.ashirokov.dev` after a reload; `pnpm status` in `registry` shows what runs where.

| Action | How | What happens |
|---|---|---|
| Snapshot | `tasks-remote` → **Deploy**: stand `dev3`, ref `develop` (any branch) | Built as `1.7.0-snapshot.<run>+<sha>`, gated against the dev3 host, uploaded over `portal-snapshots/dev3/tasks/`. Registry untouched. |
| Release candidate | **Deploy**: stand `dev2`, ref `release/1.6` | `1.6.0-rc.<run>` published to `portal-releases`, `dev2/tasks.json` committed → Config deploy → live. |
| Release tag | **Deploy**: stand `dev1`, ref `v1.5.2` | `1.5.2`: published once, reused afterwards; `dev1/tasks.json` committed. |
| Wrong line / stand | `develop` → dev2, anything → `tst`, `release/1.6` → dev1 | Refused before the build, with the way out in the log. |
| Rollback | **Deploy** the previous tag to the stand | Back through the same gate, nothing rebuilt. |
| Promote | `registry` → **Promote** (dev1 → tst) | tst gets exactly what dev1 runs. |
| Host deploy | `host` → **Deploy**: `dev3` + any branch, `dev2`/`dev1` + `release/X.Y` or a tag | Same stand rules as remotes; reverse gate against the stand's remotes; release stands get an immutable `host@X.Y.Z(-rc.N)` through `<stand>/_host.json` (ADR 0025). Refused hosts leave the stand as is. |
| First deploy of a new remote | **Deploy** with `base-path` and `scopes` | The registry entry is created with that route and allowlist; refused before upload without them. |
| Incompatible build | `DEMO_REQUIRE_ROUTER=^9.0.0 pnpm build && pnpm verify` (locally, in `tasks-remote`) | Gate 1 fails. |
| Gate 2 by hand | `pnpm check` in `registry` | Every entry checked against its stand's host `compat.json`. |

Deploys need the Nexus deploy credentials, which only the pipelines have: locally you build, verify and run the
gates, not upload.

## Local development

| Mode | How | Result |
|---|---|---|
| Standalone remote | `pnpm dev:standalone` in the remote | Remote alone with its mock platform — the default loop |
| Local host + local remote(s) | `host/.env.development.local`: `PORTAL_STAND=dev3` + `PORTAL_REMOTE_TASKS=http://localhost:5174/mf-manifest.json`; run the remote's `pnpm dev` and the host's `pnpm dev` | Host + your remote locally with Fast Refresh; every other remote as deployed on dev3 (the dev server reads `https://dev3.poc.ashirokov.dev/config.json`) |
| Only local remotes | `PORTAL_STAND=none` + one `PORTAL_REMOTE_*` per remote you run | Nothing from a stand; the host shows just your remotes |
| New remote, not released yet | `PORTAL_REMOTE_REPORTS=http://localhost:5176/mf-manifest.json` | Works before any registration: route `/reports`, scopes from its own `config.json` |

`local` is not a stand: the registry describes deployed stands only, a developer machine is described by its own
`.env.development.local`.

Deployed stands never load local code. The host toolbar / demo panel shows `name@version · registry|local ·
integrated|bridge|error` for every remote.

## Investigating a bug on a stand

Every build records the commit it was made from: `metaData.portal.commit` in a remote's `mf-manifest.json`, `commit`
in the host's `compat.json` (`-dirty` if the working tree had uncommitted changes). `pnpm status` in the registry
lists both per stand; the host's remotes panel shows them in the browser. To reproduce: check out those commits,
run the remote(s) locally and the host with `PORTAL_STAND=<stand>` — the other remotes stay as deployed there, and
every app talks to that stand's backends (`env.name` = the stand). In the real project this needs `localhost` in
the stand's app registration (redirect URI) and in its BFFs' CORS; production stays closed to it.

## Build tooling

All apps build through `@portal-poc/vite-config` (pinned Vite + MF plugin, MF section of the contract). Manifests record
`pluginVersion`; `verify`, `deploy`/`release` and the host runtime reject unsupported tooling (ADR 0019).
