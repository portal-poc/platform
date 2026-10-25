# Branches → stands

GitHub flow with release branches; fixes are made **in the release branch** where the bug was found. **Nothing
deploys by itself**: a developer opens the remote's **Deploy** workflow, picks the stand and the branch or tag, and
presses Run (as in the current project). The registry (`stands.json`) says what each stand accepts; `portal-cli
deploy` checks it **before building**.

| Stand | Who | Accepts (registry `stands.json`) | Artifact |
|---|---|---|---|
| dev3 | developers | `"snapshot": true` — any branch (`develop`, `feature/…`) | overwritten in place: `portal-snapshots/dev3/<remote>/` |
| dev2 | QA | `"branch": "latest-release"` — the newest `release/X.Y` and its tags | immutable: `portal-releases/<remote>/<version>/` |
| dev1 | team testers | `"branch": "release/1.5"` — the pilot line, pinned | immutable |
| tst | business | `"promoteFrom": "dev1"` — never deployed to | the same artifacts dev1 runs |

```
            Deploy → Run workflow:  stand [dev3 ▾]   ref [develop ▾]
                 │
     ┌───────────┴──────────────────────────────┐
     ▼ snapshot stand (dev3)                    ▼ release stand (dev2 / dev1)
 any branch                                release/X.Y → X.Y.<next>-rc.<run>
 version 1.6.0-snapshot.<run>+<sha>        tag vX.Y.Z  → X.Y.Z (published once, reused afterwards)
 (identifies the build, addresses nothing) only the stand's line (else refused, before the build)
     │                                          │
 build → gate vs dev3 host → upload        build → publish (no redeploy) → gate vs the stand's host
 OVERWRITE portal-snapshots/dev3/tasks/    → commit dev2/tasks.json = the release
 registry untouched (constant entry)            │
     ▼                                          ▼
 dev3 runs it on the next page load        dev2 / dev1 run it on the next page load

 tst: "Promote" in the registry repository copies what dev1 runs (same artifacts, no rebuild)
```

The host follows the same rules ([ADR 0025](adr/0025-versioned-host.md)): its **Deploy** takes any branch to dev3,
`release/X.Y` or `vX.Y.Z` of the stand's line to dev2 / dev1 (published once to `portal-releases/host/<version>/`,
recorded in `<stand>/_host.json`, installed by the config deploy), and never tst — Promote brings dev1's host along.

## Day to day

1. **Feature** — work on `feature/x`; to show it, **Deploy** `feature/x` → `dev3`. Merge to `develop`, **Deploy**
   `develop` → `dev3`. No version bump, no registry change.
2. **New release** — create `release/1.6` from develop, bump develop's `package.json` to `1.7.0` (the only version
   commit; patch numbers live in tags). QA: **Deploy** `release/1.6` → `dev2` (`1.6.0-rc.N`), or tag `v1.6.0` and
   deploy the tag.
3. **Fix in the newest release** — fix branch from `release/1.6` → PR → merge; **Deploy** `release/1.6` → `dev2`
   (`1.6.1-rc.N`); when QA is happy, tag `v1.6.1` and deploy the tag. The forward-merge PR
   `release/1.6 → develop` opens automatically.
4. **Fix in the pilot** — the same on `release/1.5` → **Deploy** to `dev1`; forward-merge PRs
   `release/1.5 → release/1.6 → develop` (each merge opens the next). After the testers: **Promote** in the registry
   (or `pnpm promote:tst`) → the same version on `tst`.
5. **Pilot moves to 1.6** — `portal-cli stand switch dev1 --branch release/1.6 --pr`: one registry PR with the
   mapping and the current 1.6 versions on dev1 (copied from dev2). tst follows with the next promotion.
6. **Something broke** — dev2/dev1: **Deploy** the previous tag (the published artifact is reused, no rebuild) or
   `portal-cli release --stand dev2 --version 1.6.0`. dev3: deploy a fixed branch.

## What is refused (before anything is built)

| Deploy | Answer |
|---|---|
| `develop` or `feature/x` → dev2 / dev1 | not a release ref: deploy `release/X.Y` or `vX.Y.Z`; other branches go to the snapshot stand |
| `release/1.5` → dev2 when `release/1.6` exists | dev2 always follows the newest line |
| `release/1.4` → dev1 (pinned `release/1.5`) | refused, with the hint `portal-cli stand switch dev1 --branch release/1.4` |
| anything → tst | never deployed to: Promote from dev1 |
| a build incompatible with the stand's host | gate: blocked (or isolated if a bridge build exists); dev3 keeps its current snapshot |
| re-publishing an existing version | Nexus `portal-releases` refuses redeploy |

## Rules that make it work

- **The version names its line**: `X.Y.Z` and `X.Y.Z-rc.N` belong to `release/X.Y`, so the check needs no git
  history (after a forward merge one commit is on several branches). A release train is assumed: `release/1.5`
  means the same portal release in every repository.
- **One version per build**: the deploy sets `PORTAL_APP_VERSION` for build and publish; `publish` refuses a dist
  built with another version. Release versions are immutable: a fix is always a new rc or patch.
- **Snapshots only where nobody needs history**: on dev3 the registry entry never changes, the build is identified by
  `metaData.portal.appVersion` in its manifest (the host's remotes panel and `pnpm status` show it). Chunks are only
  kept for a day (hashed names; the next deploy deletes older ones), and `mf-manifest.json` is uploaded last, so open
  tabs keep working; a tab older than that reloads once when a chunk is gone. Nothing from a snapshot stand can be promoted.
- **The CLI comes from the platform**, not from the ref: `deploy.yml` runs `pnpm dlx @portal-poc/cli@2`, so an old
  tag deploys under today's rules; the app's own `build`/`verify` scripts come from the ref.
- **Forward merges are automatic and visible** (`forward-merge.yml`): a fix cannot silently miss newer lines.
  Merge them with a merge commit, not squash.
- **Gates per stand**: every deploy/promotion is checked against the host deployed on that stand, so a 1.5 fix is
  checked against the 1.5 host on dev1/tst, not against develop.

## Not in the PoC

- The stands and Nexus are hosted ([ADR 0021](./adr/0021-hosted-poc-stands.md)): the Deploy buttons really deploy.
  The secrets are per repository (`PORTAL_NEXUS_USER`/`PORTAL_NEXUS_PASSWORD`, a registry deploy key); real setup:
  organisation secrets and a GitHub App allowed to push to the registry's main.
- Forward-merge PRs need "Allow GitHub Actions to create and approve pull requests" in the organisation settings.
- Approvals per stand (e.g. tst) would be GitHub environments with required reviewers.
- The host has its own Deploy button (stand + ref, `deploy-host.yml`): `registry check` against the stand first, so a
  host cannot break the remotes registered there.
