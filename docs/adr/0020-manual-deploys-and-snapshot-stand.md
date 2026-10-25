# ADR 0020: Manual deploys, one snapshot stand, release stands per line

## Context

In the current project nothing deploys by itself: developers run the pipeline by hand, explicitly choosing the
target stand and the branch. Stands follow branches: dev3 = develop (developers), dev2 = the newest release branch
(QA), dev1 = the older pilot release branch (team testers), tst = the same pilot line (business). Fixes are made in
the release branch where the bug was found. Versioning every develop build (`X.Y.Z-dev.N`) and committing it to the
registry adds noise and Nexus garbage where nobody needs history.

## Decision

- **Deploys stay manual**: every remote has a **Deploy** workflow (`workflow_dispatch`: stand + ref) calling the
  central `deploy.yml`, which runs `portal-cli deploy`. No push/tag triggers a deploy. The CLI comes from the
  platform (`pnpm dlx @portal-poc/cli@2`), so an old tag is deployed under today's rules.
- **`stands.json` holds the rules**, checked before the build — exactly one per stand:
  `snapshot: true` (any branch), `branch: latest-release | release/X.Y` (that line only), `promoteFrom: <stand>`
  (never deployed to).
- **Snapshot stand (dev3)**: the build overwrites `portal-snapshots/dev3/<remote>/` in Nexus (redeploy allowed); the
  registry entry is constant (`"version": "snapshot"`). The gate runs before the upload, `mf-manifest.json` is
  uploaded last and old chunks are kept for a day (the next deploy deletes older ones), so open tabs survive; a tab
  older than that reloads when a chunk is gone. The build is identified by
  `<package version>-snapshot.<run>+<sha>` in its manifest, shown by the host and `registry status`.
- **Release stands (dev2, dev1)**: a tag `vX.Y.Z` is version `X.Y.Z` (published once, reused by later deploys and
  rollbacks); a branch `release/X.Y` builds `X.Y.<next>-rc.<run>`. Published to `portal-releases` (redeploy
  disabled), released by a registry commit.
- **Registry writes are commits to main** by the deploy bot (the button press is the approval); hand edits and
  `stand switch` stay pull requests with CODEOWNERS; `tst` is filled by the registry's Promote workflow.
- **Nexus raw API** (`PUT /repository/<repo>/<path>`) is the only publishing interface.

## Consequences

The team keeps its familiar "pick stand + branch → Deploy", developers can put any branch on dev3 without versions
or registry changes, and the stands that testers and the business use keep immutable versions, gates and
no-rebuild rollbacks. Cost: dev3 has no history (rollback = deploy another branch) and one more Nexus repository
cleaned by the deploys themselves. ADR 0017 still applies to every stand except the snapshot one.
