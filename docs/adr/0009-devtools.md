# ADR 0009: Devtools via mount functions

## Context

Passing remote QueryClients to the host couples devtools versions and gives the host control over foreign caches.

## Decision

A remote registers `createQueryDevtoolsMount(client)` when its client is created; the host's `DevtoolsToolbar` provides a shadow-root container, a selector and auto-selection (one mounted remote → it, otherwise host; pin persisted). Devtools chunks load lazily (`/production` entry); toolbar in dev or behind `?devtools=1`.

## Consequences

Works unchanged for bridge remotes (own React root). Registry notifications are deferred (registration happens during a remote's render).
