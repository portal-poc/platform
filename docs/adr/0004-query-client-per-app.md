# ADR 0004: Own QueryClient per application

## Context

Each app talks only to its own BFF; a shared cache created hidden coupling (bookmarks hacks).

## Decision

`createPortalQueryClient()` is a factory with portal defaults (staleTime 30 s, no retry on 4xx/validation, 2 retries on network/5xx, `refetchOnWindowFocus`, errors → telemetry). Remotes keep a lazy module singleton `getRemoteQueryClient(platform)`; keys start with the app namespace and come from `queryOptions` factories.

## Consequences

Transitions/Suspense/ViewTransition work across the boundary (they need a shared React root, not a shared cache — verified). Account change resets each app's own client (`useClearCacheOnAccountChange`; reset of active + removal of inactive queries, because mounted observers do not refetch after a bare `clear()`).
