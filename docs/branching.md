# Branches → stands

GitHub flow with release branches; fixes are made **in the release branch** where the bug was found.

| Stand | Who | Follows (registry `stands.json`) | How a version gets there |
|---|---|---|---|
| dev3 | developers | `develop` | automatically on every merge to develop |
| dev2 | QA | `latest-release` — the newest `release/X.Y` | automatically on a `vX.Y.Z` tag of that line |
| dev1 | team testers | `release/1.4` — the pilot line, pinned | automatically on a `vX.Y.Z` tag of that line |
| tst | business | `promoteFrom: dev1` | only by promotion: exactly what passed dev1, never rebuilt |

## Day to day

1. **Feature** — PR to `develop`, merge. CI builds `1.6.0-dev.57` → PR to `dev3` (auto-merge on a green gate).
2. **New release** — create `release/1.5` from develop, tag `v1.5.0`. CI → `dev2`. Bump develop's `package.json` to
   the next line (`1.6.0`) — the only version commit; patch numbers live in tags.
3. **Fix in the newest release** — fix branch from `release/1.5` → PR → merge → tag `v1.5.1`. CI → `dev2`, and opens
   the forward-merge PR `release/1.5 → develop`.
4. **Fix in the pilot** — the same on `release/1.4` → tag `v1.4.2`. CI → `dev1`, forward-merge PRs
   `release/1.4 → release/1.5 → develop` (each merge opens the next). After the testers: **Promote** workflow in the
   registry (or `pnpm promote:tst`) → the same `1.4.2` on `tst`.
5. **Pilot moves to 1.5** — `portal-cli stand switch dev1 --branch release/1.5 --pr`: one registry PR with the
   mapping and the current 1.5 versions on dev1. tst follows with the next promotion.
6. **Something broke** — revert the registry PR; the stand is back on the previous version, no build.

People merge PRs, push tags and press "Promote"; CI decides versions and stands.

## Rules that make it work

- **The version names its branch** (`portal-cli release --auto`): `X.Y.Z-dev.N` → develop, `X.Y.Z[-rc.N]` →
  `release/X.Y`. CI never guesses from git history (after a forward merge one commit is on several branches).
  This assumes a release train: `release/1.4` means the same portal release in every repository.
- **One version per build**: CI sets `PORTAL_APP_VERSION` (tag, or `package.json`-dev.run) for build, publish and
  release; `publish` refuses a dist built with another version. Versions are immutable: a fix is always a new patch.
- **Forward merges are automatic and visible** (`forward-merge.yml`): a fix cannot silently miss newer lines.
  Merge them with a merge commit, not squash.
- **Gates per stand**: every release/promotion is checked against the host deployed on that stand, so a 1.4 fix is
  checked against the 1.4 host on dev1/tst, not against develop.
- **A tag on a line nobody follows** (e.g. `release/1.3`) is published but released nowhere; release it by hand with
  `portal-cli release --stand <stand>` if needed.

## Not in the PoC

- The CI release job is off until `PORTAL_RELEASE=true`, a real artifact repository and a registry token
  (`PORTAL_REGISTRY_TOKEN`, a GitHub App in real life) exist; the PoC runs the same commands locally.
- Forward-merge PRs need "Allow GitHub Actions to create and approve pull requests" in the organisation settings.
- Auto-merge for dev3 and CODEOWNERS approvals need the teams and branch protection in the organisation.
- The host follows the same flow in real life; the PoC deploys one host build to every stand.
