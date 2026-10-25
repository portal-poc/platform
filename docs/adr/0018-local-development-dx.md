# ADR 0018: Local development — standalone, or local host + local remotes

## Context

Developers need a fast loop and, sometimes, their remote inside the real host. Mechanisms that inject local code
into deployed stands (URL overrides) add complexity and an attack surface.

## Decision

Two modes only:

1. **Standalone** — `pnpm dev:standalone` in the remote: the same `RemoteRoot` with its own mock platform,
   router and devtools. The default loop.
2. **Local host + the remotes you work on** — run the host repo locally and your remote's dev server. The host dev
   server builds `/config.json` itself: the stand's own `/config.json` (`https://<stand>.poc.ashirokov.dev`, what is
   actually deployed there) with
   the remotes listed as `PORTAL_REMOTE_<NAME>=<dev manifest URL>` in `.env.development.local` replaced by the local
   dev servers. Anything not overridden runs the version currently registered on that stand. A remote not registered
   on the stand (a new one, before its first release) is added from the env alone: route `/<name>`, scopes from its
   own `config.json`. `PORTAL_STAND=none` = only the local remotes.

**Local is not a stand.** The registry describes deployed stands only; nothing about developer machines (dev server
URLs, which remotes someone runs) is committed there. Onboarding a remote therefore needs no registry change until its
first real release.

Local remotes get **real Fast Refresh inside the host**: the host dev server injects a recording React DevTools hook
before React DOM loads, and attaches to each local remote's React Refresh runtime and Vite client.

Deployed hosts never accept overrides; the stand CSP allows only the Nexus origin.

## Consequences

The host toolbar shows `name@version · registry|local · integrated|bridge|error`. The dev attach relies on Vite /
plugin-react internals (`/@react-refresh`, `createHotContext`, the DevTools hook shape) — dev-only, but covered by the
pinned build tooling (ADR 0019) and should get a smoke test.
