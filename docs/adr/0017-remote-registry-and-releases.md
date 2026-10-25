# ADR 0017: Remote registry, immutable releases and compatibility gates

## Context

Dynamic Module Federation removes the host rebuild from remote releases, but the coupling moves to runtime and
config: which build runs where, whether it is compatible with the host currently deployed on that stand, how to roll
back, and how open tabs survive a deploy. Overwriting one stable URL per stand gives none of that.

## Decision

- **Immutable artifacts**: every remote build is published once to `<nexus>/<name>/<version>/` (+ `bridge/` for the
  isolated variant) and never overwritten (`portal-cli publish`). Cache: versioned folders `immutable`, configs
  `no-cache`. Exception: the developers' snapshot stand (ADR 0020).
- **Registry** (`registry/<stand>/<remote>.json`): version + manifest URL (+ bridge manifest) owned by the remote team;
  `basePath`/`scopes` owned by the host team (CODEOWNERS). A release is a change of one file (a commit by the deploy, ADR 0020); it runs the
  config deploy (`portal-cli registry build` → the stand's `/config.json`). Rollback = point back to an older version.
  The host is never rebuilt for a remote release.
- **The host publishes `compat.json`** (exact singleton versions it provides + supported contract range) with every
  build.
- **Three gates**: (1) remote CI `portal-cli verify` (ranges, exposes, contract package); (2) `portal-cli release`
  verifies the published manifest against the compat.json of the host deployed on the target stand — incompatible →
  blocked, unless a bridge build exists (then released as isolated, with a warning); reverse direction: `portal-cli
  registry check` in the host deploy; (3) runtime: the host reads the remote manifest BEFORE executing remote code and
  compares required singleton versions with what it provides → integrated / bridge build / clear error.
- **Bridge build**: every remote also builds a variant without shared dependencies (`vite build --mode bridge`, MF
  name `<name>_bridge`) — the safety net for laggards during singleton major upgrades.
- **Observability**: telemetry tagged `name@version`; remote status (version, source, mode) in the host toolbar;
  `portal-cli registry status` as the versions dashboard.

## Consequences

Releases are fast, audited and reversible without involving the host team; incompatibilities are caught before
users see them. Cost: a registry repository (or folder) with branch policies, PR automation from remote pipelines,
a config deploy job per stand, and a second (bridge) build per remote.
