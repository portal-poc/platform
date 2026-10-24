# ADR 0018: Local development experience across hosts and remotes

## Context

With many teams, nobody should need to run every app locally, yet everyone must be able to see their code inside the
real host.

## Decision

Three supported modes, each one command:

1. **Remote standalone** — `pnpm --filter tasks-remote dev:standalone`: same `RemoteRoot`, own mock auth, router,
   devtools. Fastest loop for most work.
2. **Remote inside a deployed host** — run only the remote's dev server and open the stand with
   `?remote.tasks=http://localhost:5174/mf-manifest.json` (allowed on non-prod stands; kept for the session;
   `?remote.tasks=` clears it). Every other remote comes from the stand registry. The host attaches to the remote's
   dev server (React Refresh runtime + Vite client); the deployed host runs production React, so a save reloads the
   page.
3. **Everything local** — `pnpm dev`: local stand (registry `local` = dev servers), **real Fast Refresh of remote
   components inside the host** (the host injects a recording React DevTools hook in dev so the remote's refresh
   runtime finds React DOM). `PORTAL_STAND=uat pnpm --filter host dev` runs the local host against uat remotes
   instead — host developers need no remote dev servers.

## Consequences

The toolbar shows where each remote comes from (registry version or local override) and in which mode it runs.
Overrides are a dev feature: disabled on prod stands and still limited by the stand CSP.
