# @portal-poc/events

**The catalog of events that cross application boundaries in the browser**, with typed, validated publish and
subscribe over `platform.events`. Use it when one app's action must make another app on the same page react — e.g.
tasks bookmarks something → the host's bookmarks widget refetches. Publisher and subscriber are deployed
independently, so every event is a public API with an owner and a schema.

```sh
pnpm add @portal-poc/events zod
```

## Exports

| Export | Use it to |
|---|---|
| `publishEvent(platform, event, payload)` | Validate against the catalog schema, then emit. Invalid → telemetry, not sent. |
| `subscribeEvent(platform, event, listener)` → unsubscribe | Receive typed, validated payloads; mismatching ones are logged and skipped. |
| `defineEvent(name, owner, schema)` | Add an entry to the catalog (in this package, by the owning team's PR). |
| `bookmarksChanged` | `bookmarks.changed`, owner `tasks`: `{ source, correlationId? }`. |
| `EventPayloadError`, `PlatformEvent`, `EventPayload<E>`, `EventPlatform` | Error and types. |

```ts
publishEvent(platform, bookmarksChanged, { source: REMOTE_NAME, correlationId });

useEffect(() => subscribeEvent(platform, bookmarksChanged, () => queryClient.invalidateQueries({ queryKey: ['bookmarks'] })), [platform]);
```

## Rules for the catalog

- Names: `<domain>.<what happened>`, past tense. The owner is the publishing team; it reviews payload changes.
- Payload changes are additive only (a new optional field). Anything else is a new event `<name>.v2`; the publisher
  emits both until no stand runs an old subscriber; the old entry goes in a major release.
- Payloads carry ids and hints, never data: the subscriber refetches from its own BFF.
- Backend-originated changes ("your data changed on the server") are not browser events: use
  `@portal-poc/realtime` from your BFF.

Decision: [ADR 0023 — events live in a catalog, not in the contract](../../docs/adr/0023-event-catalog.md).
