# ADR 0003: Platform contract is passed as a prop

## Context

In polyrepo the host's `Provider` and the remote's `useContext` may reference different context objects.

## Decision

`@portal/platform-contract` is types only + `PLATFORM_CONTRACT_VERSION`. The host builds a `PlatformContract` per remote (`buildPlatformForRemote`) and passes it to `RemoteRoot`; the remote raises its own `PlatformProvider`, `QueryClientProvider`. Standalone builds the same type with `createStandalonePlatform`. No http client, QueryClient or realtime in the contract.

## Consequences

RemoteRoot does not know its mode. Additive evolution only (`getAccessToken` gained an optional `forceRefresh`; `PlatformEventMap` is an interface so declaration merging works).
