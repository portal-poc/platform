# ADR 0019: Build tooling is a build-time singleton

## Context

`mf-manifest.json` and `remoteEntry.js` are produced by the Module Federation plugin. A remote built with another
Vite/plugin version can emit a format the host's MF runtime cannot load — and that breaks federation in the host,
not just the remote.

## Decision

- **`@portal/vite-config`**: `createRemoteViteConfig()` / `createHostViteConfig()` own the MF section (name, exposes
  by convention, shared singletons, bridge variant), React Compiler and the `PORTAL_APP_VERSION` define. Teams extend
  everything else via `extend`.
- **Pinned ranges** in `@portal/mf-shared` (`SUPPORTED_BUILD_TOOLING`: vite `~8.3`, MF plugin `~1.23`): the preset
  refuses to build outside them; tooling is upgraded together with the preset, not per app.
- **Recorded and checked**: manifests carry `metaData.pluginVersion` (+ `metaData.portal.vite/appVersion`); the host
  publishes the plugin range it supports in `compat.json` (`remoteTooling`); `portal-cli verify` and `release` reject
  unsupported tooling; the host checks it at runtime before executing remote code (clear error, host keeps working).

## Consequences

Upgrading Vite or the MF plugin is a platform release: bump the preset and the supported range, verify the host's
MF runtime loads both old and new manifests during the transition (widen the range first), then let Renovate roll it
out to remotes.
