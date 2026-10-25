# ADR 0025: The host is versioned and rides the release train

## Context

Remotes had immutable versions, release lines and promotion; the host had none of it. Its version was always
`0.1.0`, any ref could be deployed to any stand (tst included) and overwrote it, rollback meant rebuilding an old
ref, and nothing recorded which host a stand ran — the first question of every bug investigation.

## Decision

- **Same stand rules as remotes** (`stands.json`), checked by `portal-cli host deploy` before the build:
  - snapshot stand (dev3): any branch → `<package version>-snapshot.<run>+<sha>`, installed in place;
  - release stands (dev2, dev1): `release/X.Y` → `X.Y.<next>-rc.<run>`, tag `vX.Y.Z` → `X.Y.Z`, of the stand's line;
    published once to `portal-releases/host/<version>/` (immutable, like a remote release);
  - promoted stand (tst): never deployed to — Promote brings the source stand's host.
- **The registry records the host**: `<stand>/_host.json` (`version`, `commit`). On release stands writing it is the
  release; the config deploy installs it (`portal-cli host sync`: copies the published files onto
  `portal-stands/<stand>/host/`, `compat.json` and `index.html` last, then removes old files). dev3 keeps a constant
  `"snapshot"` entry, like remote snapshots.
- **Gates both ways**: every host build or release passes the reverse gate against the stand's remotes; Promote and
  `stand switch` gate the remotes against the host that comes along.
- **Rollback**: deploy an older tag, or `portal-cli host release --stand <s> --version <older>` — no rebuild.
- **Branches**: the host has `release/X.Y` lines like every repository; `main` builds the next line
  (`package.json`), fixes are forward-merged. The lines up to 1.7 were cut from the host as it was (one host serves
  every line today; the reverse gate proved it against each stand's remotes).

## Consequences

- `registry status` and the host's remotes panel show `host <version> · <commit>` per stand; a registry version not
  installed yet is marked.
- A host change reaches business testers only through dev1 and Promote, like a remote change.
- Stands without `_host.json` keep their host until the next host deploy (migration needs no big bang).
