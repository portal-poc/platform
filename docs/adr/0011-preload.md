# ADR 0011: Preload on intent: the remote's code and its first data

## Context

Opening a remote section is a waterfall: manifest → compatibility checks → remote code → the page's first query →
render. The time between the pointer resting on a link and the click is enough to run most of it.

## Decision

- **The host decides when**: a pointer resting on a link to a remote section for 100 ms, keyboard focus or a touch
  (`usePreloadIntent`: the host menu, the bookmarks widget). Never with `saveData`, never signed out, once per target
  per 30 s.
- **The host warms the code**: the same load `RemoteApp` renders from (manifest, gates, `RemoteRoot`). A hover never
  triggers the stale-build reload: only a render may reload the page.
- **The remote decides what**: `./preload` — `preload(platform, { path })`, `path` inside the remote. It mirrors its
  routes and calls `prefetchQuery` on the QueryClient RemoteRoot uses. It never throws; a failed preload costs
  nothing (the click loads as usual and shows any error there).
- **One QueryClient**: `./preload` and `./RemoteRoot` import the same `shared/api` module; the MF build puts it in one
  chunk (verified in `mf-manifest.json`: both exposes depend on the same `assets/api-*.js`), so prefetched data is
  the data RemoteRoot reads. Bridge remotes get the code only: their QueryClient lives in their own build.

## Consequences

- A click on a section or a bookmark after a short hover renders from cache, without the remote's spinner.
- Every remote keeps `./preload` in sync with its routes (template example; `verify` checks the expose exists).
