# ADR 0008: ViewTransition: host owns routes

## Context

Only one view transition runs per document; uncoordinated ones interrupt each other.

## Decision

The host animates routes: navigation in an async transition with `addTransitionType('nav-forward'|'nav-back')` (the router's later state update is entangled with it), page-level `<ViewTransition>` with type maps and `default="none"`, keyed per route. Remotes only animate local changes (list items via `useDeferredValue`, shared elements named with the remote prefix `tasks-task-42`). Never the router's own `viewTransition` flag (deprecated in v8.5), never `document.startViewTransition` by hand. 150–250 ms, off under `prefers-reduced-motion`.

## Consequences

Route elements need a `key` (otherwise React sees an update, not exit/enter). Browser back/forward carries no type.
