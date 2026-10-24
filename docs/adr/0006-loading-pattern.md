# ADR 0006: Loading indication via CSS delays

## Context

Spinners for fast operations flicker; JS timers re-render and do not work in Suspense fallbacks.

## Decision

< 300 ms nothing; > 300 ms spinner on the action/fallback; > 2 s blocking overlay. Delays are CSS (`--spinner-delay`, `--pending-button-delay`, `--pending-overlay-delay`); `PendingRegion` sets one `data-pending` attribute; `AsyncButton` is disabled immediately. The only JS timer is the `aria-live` announcement (`useSpinDelay`).

## Consequences

React 19 throttles Suspense reveals (~300 ms after a fallback commits), so with a 300 ms spinner delay fast loads never show it. `useLoadingStage` exists for logic that needs the stage. DS `AsyncBoundary` has no react-query dependency (see ADR 15).
