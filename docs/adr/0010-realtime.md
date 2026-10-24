# ADR 0010: Realtime — out of scope

## Context

The real project already has WebSocket pub/sub.

## Decision

Section 12 (per-app connection, thin events, invalidation on reconnect) is not implemented in this PoC. Cross-app bookmark refresh uses the local `platform.events` bus (`bookmarks.changed`) + `refetchOnWindowFocus`.

## Consequences

Subscriptions must outlive the widget that displays the data (the host subscribes in its layout); see open questions for mapping the existing pub/sub.
