# ADR 0002: Integrated by default, bridge as a route-level exception

## Context

Teams on other React versions must still be embeddable; config alone cannot guarantee "share if compatible, else own copy".

## Decision

Each remote exposes `./runtime` (`remoteCreateElement`, `contractVersion`). The host compares `createElement` BY REFERENCE: same instance → `./RemoteRoot` (integrated: shared transitions, Suspense, context, ViewTransition); otherwise → `./RemoteBridge` (MF Bridge, own root). One host component `<RemoteApp name>` hides the difference. Bridge is allowed only at route level.

## Consequences

Bridge limits (documented in legacy-remote): no shared transitions/Suspense/context, own fallback, host view transitions animate only the container, one view transition per document. Host uses `@module-federation/bridge-react/base` because the router entries only support React Router ≤7.
