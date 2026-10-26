# 0028 — Platform changes reach apps as migrations developers run

## Context

Apps own their code (ADR 0014: the template is never synced again) and upgrade platform packages on their own
schedule. Most platform changes are drop-in — additive contract, configs inherited from presets, CI from the central
workflows — and arrive with a version bump. Some are not: a hook changes its signature, an option is renamed, a
config file gets a new field. In the current project each such change is a wiki page and a manual pass over every
repository; the copies drift.

Apps may be written in TypeScript or JavaScript: that is the team's choice.

## Decision

- **Migrations ship with the package that changed.** A package exports `./migrations` → `{ migrations: Migration[] }`;
  each migration has an `id`, the package `version` that needs it, a one-line `description` and `run(ctx)`. It is
  written, reviewed, tested and released together with the change. The CLI is only the runner.
- **Developers run them, when their team decides** — on a branch, like any change:
  `pnpm dlx @portal-poc/cli@2 upgrade` bumps the app's `@portal-poc/*` packages (latest, or `--to`), installs, runs
  the migrations of every bumped package from the version the app had, then the app's `typecheck` / `lint` / `test`,
  and prints (or writes, `--report`) bumps, changed files, manual steps and check results. `portal-cli migrate` runs
  them without bumping (after a manual bump; `--dry-run` prints the patch). Nothing opens PRs in app repositories:
  no cross-repository tokens, no bot in the teams' flow. If that is wanted later, a pipeline runs the same command.
- **CI warns, does not fail**: the central app CI runs `migrate --check` and annotates the run when migrations are
  left. An app may stay behind a deprecation until the next major.
- **Engine: ts-morph.** Platform changes are mostly about the contract's types and signatures; ts-morph sees types
  (where the app's types resolve) and has a readable API for platform developers. JS apps are parsed by the same
  TypeScript parser (`allowJs`); types of our packages still come from their `.d.ts`. The rare Babel-only syntax a
  parser cannot read is reported as a manual step.
- **Rules for migrations** (enforced by the scaffold and the test helper, docs/migrations.md):
  - anchored on imports of the package (`ctx.findCalls(module, export)` handles aliases and namespace imports), so
    a local function with the same name is never touched;
  - idempotent: the test runs every fixture twice; this is also what makes `migrate` without `--from` safe;
  - type-only imports from `@portal-poc/cli/migrations` (the module is loaded from the app's node_modules, where the
    CLI is not the package's dependency); ts-morph values come as `ctx.morph`;
  - edits through `ctx.replace` (exact text, applied after `run`), `ctx.json` / `ctx.yaml` / `ctx.text`;
  - what cannot be decided safely goes to `ctx.manual(note, node)` — the developer sees file and line;
  - fixtures in `.tsx` and `.jsx` for every case.
- **Breaking changes go through deprecation**: the new API ships in a minor next to the old one (marked
  `@deprecated`), with a migration; the old one goes in the next major. A migration is never edited or removed after
  release: apps may jump several versions.

## Consequences

- Adding a migration: `portal-cli migration create <id>` in the package → module, fixture test, TSX + JSX fixture
  pairs, registration, `./migrations` export. Fill the fixtures, write `run`, `pnpm test`.
- Upgrading is one command and a reviewable diff instead of reading release notes; the manual remainder is explicit.
- The first migration: runtime 2.3.0 `leave-guard-object` (`useLeaveGuard(when, options)` → `useLeaveGuard({ when,
  ...options })`).
- The same machinery can carry the one-off moves of the migration plan (A1–A3: `window.env` → `@portal-poc/http`,
  copied configs → presets) as codemods teams run once.
- Costs: ts-morph (~10 MB with its TypeScript) is a dependency of the CLI only — `pnpm dlx` downloads it, apps do not
  ship it. Teams that never upgrade still drift; the CI warning makes it visible.
