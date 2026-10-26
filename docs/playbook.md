# Playbook: every development and delivery scenario

What to do, who does it, and what happens — one section per situation. The diagrams are marble diagrams: time runs
left to right, each lane is a branch, a button, Nexus, the registry or a stand.

```
Legend   ●  commit          ◆  tag            ▲  someone presses a button / runs a command
         ◉  artifact in Nexus                 ■  registry commit (= what a stand runs)
         ▶  stand serves it (next page load)  ✗  refused / blocked     ┄┄  automatic step
```

How the pieces fit: [overview.md](overview.md). Reference: [branching.md](branching.md) (stand rules), [delivery.md](delivery.md), [migrations.md](migrations.md),
[central workflows](../.github/workflows/README.md), package READMEs under `packages/*/README.md`.

| Stand | Who looks | Accepts | Artifact |
|---|---|---|---|
| dev3 | developers | any branch | snapshot, overwritten in place |
| dev2 | QA | the newest `release/X.Y` or its tags | rc / release, immutable |
| dev1 | team testers | the pinned pilot line (`release/1.5`) | rc / release, immutable |
| tst | business | only Promote from dev1 | the same artifacts as dev1 |

---

## Development

### D1. First-time setup

1. GitHub token with `read:packages` → `~/.npmrc`:
   ```
   @portal-poc:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=<token>
   ```
2. Repositories side by side: `~/projects/portal-poc/{platform,registry,host,tasks-remote,legacy-remote}`.
3. Node 24 and pnpm (versions in `.nvmrc` / `packageManager`), `pnpm install` in each.

### D2. Work on a remote alone

```sh
cd tasks-remote && pnpm dev:standalone      # http://localhost:5174, mock login, devtools, the remote's own router
```

Mock platform (`createStandalonePlatform`), fake BFF where `config.json` says `"fakeBackend": true`. Fastest loop
for pages and components; no host, no other remotes.

### D3. Work on a remote inside the host

```
host (local :5173)  ── reads /config.json of PORTAL_STAND ──▶ every remote as deployed there
                    └─ PORTAL_REMOTE_TASKS=http://localhost:5174/mf-manifest.json ──▶ your local tasks (Fast Refresh)
```

```sh
# host/.env.development.local
PORTAL_STAND=dev3                                   # or dev2 / dev1 / tst / none (only local remotes)
PORTAL_REMOTE_TASKS=http://localhost:5174/mf-manifest.json
cd tasks-remote && pnpm dev     # then, in another terminal
cd host && pnpm dev
```

Use `PORTAL_STAND=tst` to reproduce a bug against exactly what business sees, with your fix local. A remote that is
not registered anywhere yet works the same way (route `/<name>`). Nothing here touches the registry.

### D4. A new remote

```
          ▲ portal-cli create remote reports        ▲ push main+develop    ▲ Deploy dev3 develop
reports   ●─────────────────────────────────────────●──────────────────────●───────────▶
                                                     platform team:              base-path=/reports
                                                     package access, secrets      scopes=api://reports-bff/…
registry                                                                    ■ dev3/reports.json (first deploy only)
dev3                                                                         ▶ /reports appears in the menu
```

1. `pnpm dlx @portal-poc/cli@2 create remote reports` (asks for FSD layers, presets, bridge entry).
2. Create `portal-poc/reports-remote`, push `main` and `develop`.
3. Platform team: Manage Actions access on every `@portal-poc` package for the repo; secrets
   `PORTAL_NEXUS_USER`, `PORTAL_NEXUS_PASSWORD`, `PORTAL_REGISTRY_SSH_KEY`.
4. **Deploy** → `dev3`, `develop`, fill **base-path** and **scopes** (from `public/config.json`). They become the
   registry entry; later deploys keep them. Repeat per stand when the remote reaches its release lines.

### D5. Common app tasks

| Task | How | Package |
|---|---|---|
| Call your BFF | `http.get(...).then(parseResponse(schema))` in `shared/api` | [http](../packages/http/README.md) |
| Own cache | `createPortalQueryClient()` once per app (generated) | [runtime](../packages/platform-runtime/README.md) |
| Don't lose a form | `useLeaveGuard({ when: isDirty, message })`, `lock: true` while saving | runtime |
| Page title | `usePageTitle(title)` | runtime |
| Prefetch on hover | add the route to `src/app/exposes/preload.ts` | runtime / host |
| Tell another app something changed | add an event to the catalog, `publishEvent` / `subscribeEvent` | [events](../packages/events/README.md) |
| Backend says "refetch" | `useRealtimeEvent(realtime, 'topic', invalidate)` | [realtime](../packages/realtime/README.md) |
| New slice | `pnpm exec portal-cli add page settings` | [cli](../packages/portal-cli/README.md) |
| UI | import from `@portal-poc/ds` only | [ds](../packages/ds/README.md) |

### D6. Change a platform package

```
platform main  ──●──────────────●──────────────────●──────────────▶
                 additive change │ breaking change: new API + @deprecated old + migration (portal-cli migration create)
                 minor bump      │ minor bump                         major later: old API removed
Release pkgs    ▲ ┄┄ ◉ 1.4.0     ▲ ┄┄ ◉ 2.3.0                        ▲ ┄┄ ◉ 3.0.0
apps             (upgrade when they want: D7)
```

1. Change, test, bump the package version (`pnpm check` green).
2. Breaking for apps? Keep the old API (deprecated), add a migration — [migrations.md](migrations.md).
3. Merge to platform `main`, run **Release packages** (Actions) or push a `v*` tag: new versions are published.
4. Changed a central workflow? Move the tag: `git tag -f v2 <sha> && git push -f origin v2` — every app's next run
   uses it. Never move it to an untested commit.
5. Changed the contract, singletons or tooling ranges? That touches every app and the host: ADR first.

### D7. Upgrade the platform in an app

```
develop        ──●─────────────────────────────────●(merge)──▶
chore/upgrade      └─▲ pnpm upgrade:platform ──●──▲ PR┘
                       bump → install → migrations → typecheck/lint/test → review diff + manual steps
app CI           (migrate --check warns while something is left)
```

```sh
git checkout -b chore/platform-upgrade
pnpm upgrade:platform            # --dry-run first; --to @portal-poc/platform-runtime@2.3.0 to stop at a version
git diff                         # do the "Manual steps" it printed
```

When versions were bumped by hand: `pnpm exec portal-cli migrate` (idempotent; `--check` lists what is left).

### D8. What runs on a stand, and from which commit?

```sh
cd registry && pnpm status       # remote × stand: version · commit · singletons · bridge build
```

The host's remotes panel (devtools toolbar, `?devtools=1`) shows the same in the browser. To debug: check out that
commit, run it locally against the stand (D3 with `PORTAL_STAND=<stand>`).

---

## Delivery

### R1. A feature on dev3

```
feature/x   ──●──●─────────────●(merge)
                  ▲ Deploy dev3 feature/x     (optional: show it before merging)
develop     ──────────────────────●───────────────────▶
                                   ▲ Deploy dev3 develop
Nexus snap          ◉ dev3/tasks (overwritten)  ◉ dev3/tasks (overwritten again)
registry    (untouched: dev3 entry is constant "snapshot")
dev3                ▶ 1.9.0-snapshot.41+ab12   ▶ 1.9.0-snapshot.42+cd34
```

No version bump, no registry change. The last deploy wins — coordinate in the team chat when two people show
branches. Open tabs keep working (manifest uploaded last; old chunks kept a day).

### R2. Cut a release line → QA on dev2 → release

Done in every repository of the train (host, remotes) at the same time.

```
develop       ──●───●──────────────────────────────────────────────────▶
                     \  ▲ create release/1.8, bump develop to 1.9.0 ●
release/1.8           ●──────────────────────●(fix)─────────────◆v1.8.0
                      ▲ Deploy dev2            ▲ Deploy dev2      ▲ Deploy dev2 v1.8.0
Nexus releases        ◉ 1.8.0-rc.17            ◉ 1.8.0-rc.18      ◉ 1.8.0 (published once)
registry              ■ dev2/tasks.json        ■                   ■
dev2                  ▶ rc.17                  ▶ rc.18             ▶ 1.8.0
```

1. `git push origin develop:release/1.8` (or `main:` where the trunk is main); bump the trunk's `package.json` to
   `1.9.0` and push.
2. **Deploy** host `release/1.8` → dev2 first, then each remote (the gate checks remotes against dev2's host).
3. QA on dev2. Fixes: R3. Accepted: tag `v1.8.0` on `release/1.8`, **Deploy** the tag → dev2.

`release/1.7` → dev2 is now refused: dev2 always follows the newest line.

### R3. Fix in the newest release (dev2)

```
release/1.8   ──●──────────●(fix PR merged)──────────◆v1.8.1──────▶
                            ▲ Deploy dev2 ┄┄ ◉ 1.8.1-rc.19 ■ ▶ dev2
                            ┄┄ forward-merge PR release/1.8 → develop (opens itself)
develop       ──●──────────────────────────●(merge commit)──────▶
```

Branch from `release/1.8`, PR, merge; deploy the line to dev2; tag when accepted. Merge the forward-merge PR with a
merge commit (not squash), so git knows the fix is in develop.

### R4. Hotfix on the pilot line (dev1 / tst)

```
release/1.5   ──●(fix)─────────────◆v1.5.4
                 ▲ Deploy dev1 ┄┄ ◉ 1.5.4-rc.3 ■ dev1      ▲ Deploy dev1 v1.5.4 ■ dev1
                 ┄┄ PR 1.5 → 1.6
release/1.6        ●(merge) ┄┄ PR 1.6 → 1.7
release/1.7           ●(merge) ┄┄ PR 1.7 → 1.8 ┄┄ … → develop
registry (Promote) ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ ▲ Promote dev1 → tst ■ tst
tst                                                                       ▶ same 1.5.4 artifacts
```

Each merged forward-merge PR opens the next one, so the fix walks every newer line up to the trunk. Nothing can
silently miss a line: an open forward-merge PR is visible.

### R5. Promote dev1 → tst

```
registry   ──■ dev1/* (what testers accepted) ──▲ Promote (workflow or pnpm promote:tst) ── ■ tst/* = dev1/* (host incl.)
Nexus      (nothing new: same artifacts)
tst                                                                                         ▶ next page load
```

Registry repository → Actions → **Promote** (or `pnpm promote:tst` + PR). Never deployed to tst directly.

### R6. Rollback

```
release/1.8  ──◆v1.8.0────◆v1.8.1
dev2              ▶1.8.0     ▶1.8.1 (broken)   ▲ Deploy dev2 v1.8.0 ┄┄ (already in Nexus: no build) ■ ▶ 1.8.0
```

Deploy the previous tag: the same artifact is reused, the registry gets a new commit. Equivalent:
`portal-cli release --stand dev2 --version 1.8.0` (remotes), `portal-cli host release --stand dev2 --version …`
(host). On dev3 just deploy another branch.

### R7. Move dev1 to another release line

```
stands.json  ── dev1: release/1.5 ──▲ portal-cli stand switch dev1 --branch release/1.6 --pr ── PR ── merge ── dev1: release/1.6
registry                                                           ■ dev1/* = the 1.6 versions (one commit)
dev1                                                                                              ▶ 1.6 line
```

One PR changes the mapping and the versions together. After it, `release/1.5` → dev1 is refused.

### R8. Host deploy and incompatible builds

```
host release/1.8  ●──▲ Deploy dev2 ┄┄ reverse gate: every remote registered on dev2 vs the new compat.json
                         ├─ all compatible ┄┄ ◉ host 1.8.0-rc.22 ■ dev2/_host.json ┄┄ Config deploy installs it ▶
                         └─ a remote breaks ✗ dev2 keeps its current host (the log names the remote and the conflict)

remote build      ●──▲ Deploy dev2 ┄┄ gate vs dev2's host
                         ├─ compatible ┄┄ ◉ ■ ▶
                         ├─ incompatible singleton, bridge build exists ┄┄ ◉ ■ ▶ host loads dist-bridge (isolated)
                         └─ incompatible, no bridge ✗ refused before upload
```

Gate 3 runs in the browser too: the host checks every manifest before loading; a failure stays inside that remote's
area with a retry, the rest of the portal works.

### R9. Change what a stand serves without a deploy (route, scopes, title)

```
registry  ──● PR: dev2/tasks.json basePath /tasks → /work (CODEOWNERS review) ──● merge ┄┄ Config deploy ┄┄ dev2/config.json
dev2                                                                                                        ▶ new route
```

Hand edits go through PRs; deploy commits come from the pipeline. The host is never rebuilt for it.

### R10. Platform release reaches apps

```
platform  ──●──▲ Release packages ┄┄ ◉ @portal-poc/* ──▲ move v2 (if workflows changed)
apps         ┄┄ next CI run uses the new workflows       ▲ each team: pnpm upgrade:platform (D7), when they choose
```

Packages are pulled by teams; workflows are pushed by the tag. Breaking package changes always come with a
deprecation period and a migration.

---

## When something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm install` 403 in CI | the repo has no access to a (new) `@portal-poc` package | package → Package settings → Manage Actions access → add the repo |
| Deploy refused before the build | wrong ref for the stand | the message says which ref the stand accepts (branching.md) |
| Gate failed | singleton / contract / tooling mismatch with the stand's host | upgrade within the range, or ship the bridge build |
| Remote shows "could not load" with retry | manifest missing / incompatible at runtime | `pnpm status`, host remotes panel; redeploy |
| Tab reloads once after a deploy | its chunks were removed (older than a day) | expected (stale-build recovery) |
| CI warning "Platform migrations pending" | packages bumped without migrating | `pnpm exec portal-cli migrate`, commit |
| `unknown command 'upgrade'` | pnpm cached an old CLI | `pnpm upgrade:platform` (no cache) or `pnpm --config.dlx-cache-max-age=0 dlx @portal-poc/cli@2 …` |
