# ADR 0001: Module Federation singletons

## Context

Remotes render inside the host tree; React contexts (router, emotion/Joy theme, DS) only work when the context object is the *same* in host and remote.

## Decision

Singletons: `react`, `react-dom`, `react-router` (+ `react-router/dom`), `@emotion/react`, `@emotion/styled`, `@mui/joy`, `@portal/ds` — list and ranges in `@portal/mf-shared`. Everything else is either passed by value through the contract (props) or is a versioned package bundled per app (`@portal/platform-runtime`, TanStack Query, RHF, zod).

## Consequences

Minimal stack imposed on other teams. DS singleton = everyone on one DS major (open question: tokens on CSS variables). `singleton: true` with a mismatching version silently uses the shared copy, so compatibility is decided at runtime (ADR 2). `react-router/dom` had to be added: it carries its own router internals.
