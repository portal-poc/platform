# ADR 0015: DS AsyncBoundary does not depend on TanStack Query

## Context

The DS is an MF singleton, TanStack Query is not: a `QueryErrorResetBoundary` inside the DS would use the host's react-query copy.

## Decision

DS `AsyncBoundary` takes `onReset`; each app wires `useQueryErrorResetBoundary().reset` in its `shared/ui/QueryBoundary`. Default error UI is a `FallbackComponent` (React Compiler adds hooks, so `fallbackRender` breaks).

## Consequences

Same rule for any DS code: no imports of non-singleton runtime packages.
