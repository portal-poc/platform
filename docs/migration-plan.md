# Migration plan: from today's delivery to the reference model

Scope: **how remotes are configured, released and loaded** (ADR 0017/0018). The broader architecture migration from
the requirements document (platform contract via props, own QueryClient per app, ...) is a separate track; where a
step here depends on it, it says so.

## Where we are today

| Area | Today | Problem |
|---|---|---|
| Host config | One JSON per stand **bundled into the host build**, explicit manifest URL per remote | Any config change = host rebuild + deploy |
| Remote config | Remotes read `window.env`, filled by the host from that bundled config | Host must know every remote's settings; global mutable state; standalone needs fakes |
| Remote release | Deploy to a stand **overwrites the same URL** | No gate, no rollback (rebuild old version), open tabs can hit 404 chunks, stale caches, no "what runs where" |
| Compatibility | Nothing checks host ↔ remote | Breakage found by users |

## Target (what the PoC shows)

Immutable versioned artifacts · registry per stand (PR = release, revert = rollback) · host config read at runtime ·
remotes own their config · three compatibility gates · bridge builds as a safety net · versions in telemetry ·
one-command local development modes.

## Phases

Estimates: one experienced engineer, assuming the PoC code is reused (CLI commands, host loader, compat plugin,
pipeline templates). "Per remote" = work each remote team does once, mostly a pipeline/template switch.

| # | Phase | What changes | Platform / host effort | Per remote | Unlocks |
|---|---|---|---|---|---|
| 1 | **Host reads its stand config at runtime** | `/config.json` fetched before render; remotes registered with `registerRemotes` from it; a tiny "deploy config" job per stand copies the stand file next to the host | 2–4 days | — | Config changes without host rebuild. **Prerequisite for everything else.** |
| 2 | **Immutable versioned publishing** | Remote pipelines publish to `<nexus>/<name>/<version>/` and never overwrite; the stand config points at versioned manifest URLs | 1–2 days (central pipeline template + `portal-cli publish`) | ~0.5 day | Rollback by pointer, no broken open tabs, correct caching, "what runs where" |
| 3 | **Registry + PR flow** | `registry/<stand>/<remote>.json` (start as a folder in the host repo, move to its own repo later); CODEOWNERS; branch policy; remote pipeline opens the PR (`portal-cli release`); merge triggers the config deploy | 3–5 days (incl. PR automation with a service account) | ~0.5 day | Audited releases without the host team; rollback = revert |
| 4 | **Compatibility gates** | Host build emits `compat.json`; `release` checks the stand's host; host deploy runs `registry check`; host checks manifests at runtime | 2–3 days | — (comes with the template) | Incompatible releases blocked before users see them |
| 5 | **Remotes own their config** | `config.json` inside the remote's version folder, validated by zod; stand name from the platform contract (`platform.env`); a transition helper falls back to `window.env` with a deprecation warning; then `window.env` is removed | 1 day (helper) | 0.5–1 day | Host no longer knows remote settings. *Depends on the remote receiving the platform contract as a prop (architecture track) — until then the helper can read the stand name from `window.env`.* |
| 6 | **Developer experience** | `?remote.<name>=` overrides on non-prod stands, dev-server attach (refresh runtime, Vite client), recording DevTools hook, `PORTAL_STAND` for host dev | 1–2 days | — | Remote teams test inside the real host without running it |
| 7 | **Observability** | Telemetry tagged `name@version`, remote status in the toolbar, `registry status` dashboard (or a page generated from the registry) | 1–2 days | — | Fast triage: which version, which mode, which stand |
| 8 | **Bridge builds** (when the first singleton major upgrade is planned) | Second build target without shared deps per remote; registry carries `bridgeManifest` | 0.5 day | ~0.5 day | Host can upgrade React/router/DS majors without stopping laggards |

**Total:** roughly **3–5 weeks of platform/host work** (phases 1–7; partly parallelisable) plus **1–2 days per remote
team**, spread over their normal releases. Phase 8 is scheduled with the first singleton major upgrade.

## Order and quick wins

1. **Phase 1** first — nothing else helps while configs are bundled into the host.
2. **Phase 2** right after — the biggest operational win (rollback, cache, open tabs) and independent of the rest.
3. Phases 3–4 together (the registry PR is where the gate runs).
4. Phase 5 per remote, opportunistically; phases 6–7 any time after phase 1.

## Rollout without a big bang

- **Pilot**: one remote on `uat` moves to versioned publishing + registry; the others keep their stable URLs. Both
  forms are just a manifest URL in the stand config, so the host supports them at the same time.
- **Stands in order**: dev → uat → prod. Prod gets branch policies with mandatory approval; dev may auto-merge.
- **Exit criteria per remote**: publishes immutable versions, released only through the registry, `verify` green in
  CI, no `window.env` reads (telemetry shows no fallback warnings).
- **Rollback of the migration itself**: point the stand config back at the old stable URL — the host logic does not
  care where a manifest comes from.

## Risks

| Risk | Mitigation |
|---|---|
| Teams bypass the pipeline and copy files to Nexus | Nexus write access only for the platform pipeline template ("Required template" check on the service connection); the registry gate still runs on the PR |
| PR noise in the registry | One file per remote per stand, auto-complete on green gate + owner approval |
| Version skew in long-lived tabs (old host, new remote) | Contract support window (N-1), runtime manifest check, bridge builds |
| CSP when adding remotes | Serve all remotes from one Nexus/CDN origin (path per remote) so the CSP never changes |
| Bridge builds double the remote CI time | Build the bridge variant only on release branches, or only after a singleton major is announced |
