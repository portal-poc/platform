# ADR 0023: Cross-app events live in a catalog, not in the contract

## Context

The contract typed the local bus with `PlatformEventMap`, an interface holding the domain event
`'bookmarks.changed'` and meant to be extended by declaration merging. In the polyrepo that does not work: a type
merged in the tasks repository is invisible to the host, so every new event needed a contract release — a package
that every app must agree on, for something only two apps care about. Payloads were not checked at runtime either,
while the publisher and the subscriber are deployed independently and any pair of versions can meet on a stand.

## Decision

- **The contract only transports**: `PlatformEventBus` is `emit(name, payload: unknown)` /
  `subscribe(name, listener(payload: unknown))` (contract 1.1.0, runtime unchanged, `PLATFORM_CONTRACT_VERSION`
  stays 1).
- **`@portal-poc/events`** is the catalog: `defineEvent(name, owner, zodSchema)` per event, released on its own and
  bundled into every app that publishes or subscribes. `publishEvent(platform, event, payload)` and
  `subscribeEvent(platform, event, listener)` validate on both ends; an invalid payload is reported to
  `platform.telemetry` (`EventPayloadError` with the event and its owner) and never reaches a listener.
- **Rules**: names `<domain>.<what happened>`; the owner is the publishing team and reviews every change; payload
  changes are additive only (new optional fields; subscribers ignore unknown fields); anything else is a new event
  `<name>.v2` — the publisher emits both until no stand runs a subscriber of the old one, then a major release of the
  catalog removes it. Payloads carry ids and hints, never the data: subscribers refetch from their BFF.
- **Role of the bus in the PoC**: the way one app tells another that shared data changed (tasks → the host's
  bookmarks widget), plus `refetchOnWindowFocus` for other tabs. The backend stays the source of truth. When the real
  project's pub/sub reaches the browser, it becomes the primary signal and the bus the in-tab fast path (ADR 0010).

## Consequences

- A new event is a catalog release and a dependency bump in the apps that use it; the contract and the host are not
  involved unless the host is one of them.
- Deployed versions that emit through the raw bus (tasks release lines) keep working: the name and the payload of
  `bookmarks.changed` did not change, and the subscriber validates them.
- The catalog is the place to look for "who listens to what": events are exported constants, so `fallow` and the IDE
  find every publisher and subscriber.
