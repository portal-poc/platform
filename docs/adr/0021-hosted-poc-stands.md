# ADR 0021: The PoC runs on a real Nexus and hosted stands

## Context

The Deploy workflows had the real shape, but a GitHub runner could not reach the localhost Nexus stand-in and stands,
so every deploy was simulated by running `portal-cli` by hand. To show the flow end to end (a button in GitHub → a
version on a stand), the PoC needs infrastructure reachable from CI and from a browser.

## Decision

- **One small VPS** (k3s, managed in the owner's infrastructure repository, namespace `portal`) hosts a real
  **Nexus Community Edition** at `https://nexus.poc.ashirokov.dev` and the stands
  `https://{dev3,dev2,dev1,tst}.poc.ashirokov.dev`.
- **Nexus raw repositories**: `portal-releases` (Disable redeploy: a second PUT answers 409; cached as immutable),
  `portal-snapshots` (Allow redeploy; `no-cache`), and **`portal-stands`**: what each stand serves —
  `<stand>/host/` (the host build) and `<stand>/config.json` (the registry entries). Anonymous read, CORS `*`; uploads
  only as `portal-deploy`.
- **A stand is nginx in front of `portal-stands/<stand>/`**: SPA fallback, the stand CSP (remotes from the one Nexus
  origin), its own cache headers. Nothing is copied to the server: every deploy is an upload to Nexus, the same API
  for remotes, the host and the stand config.
- **Pipelines**: remotes — `deploy.yml` (unchanged rules); host — `deploy-host.yml` (stand + ref → build →
  `portal-cli host deploy`: reverse gate against the stand's registered remotes, then upload, `compat.json` and
  `index.html` last); registry — its **Config deploy** workflow uploads every stand's `/config.json`
  (`portal-cli registry build --upload`) on each push to main and after a promotion.
- **Registry writes from CI** use a deploy key with write access (`PORTAL_REGISTRY_SSH_KEY`): unlike `GITHUB_TOKEN`,
  its pushes trigger the config deploy. A GitHub App token (`PORTAL_REGISTRY_TOKEN`) is the production form.
- **No localhost stand-in**: the host dev server reads the hosted stand's `/config.json` directly
  (`https://<stand>.poc.ashirokov.dev`, `PORTAL_STAND_URL` to override); `tools/infra` was removed.
- **Overwritten folders are cleaned by the deploy**: after a snapshot or host upload `portal-cli` deletes the files of
  earlier builds older than a day (`portal-deploy` may delete only in `portal-snapshots` and `portal-stands`); a tab
  that still runs such a build reloads once when one of its chunks is gone (`installStaleBuildRecovery`).

## Consequences

- A demo needs only a browser and GitHub: Run workflow → the version appears on the stand after a reload.
- The registry now points at the hosted Nexus: registry entries written by the localhost stand-in are not valid
  any more. The artifacts published before the move were uploaded to the real Nexus unchanged (`publicPath: auto`).
- Nexus CE limits (components, requests per day) are far above the PoC; its EULA was accepted by the owner.
- Secrets are per repository (no organisation admin token): `PORTAL_NEXUS_USER` / `PORTAL_NEXUS_PASSWORD` in every
  repository that uploads, `PORTAL_REGISTRY_SSH_KEY` in the remotes and the host.
