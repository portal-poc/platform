# ADR 0011: Preload: architecture ready, not implemented

## Context

Prefetching remote data from the host would cut waterfalls later.

## Decision

`./preload` expose is reserved (stub, checked by verify); `query-client.ts` and `queryOptions` factories are separate modules; the QueryClient is created lazily and registers devtools at creation.

## Consequences

Must verify on the MF build that `./preload` and `./RemoteRoot` share one `query-client` module instance.
