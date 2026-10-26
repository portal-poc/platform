# @portal-poc/mf-shared

**The Module Federation part of the integration contract, as data** — one source for the build preset
(`@portal-poc/vite-config`), the checks (`portal-cli verify`, deploy gates) and the host's runtime checks. Apps don't
import it; you read it to know what a remote must expose and which dependencies are shared.

## What it defines

| Export | Meaning |
|---|---|
| `REMOTE_EXPOSES`, `REQUIRED_EXPOSES` | Every remote exposes `./RemoteRoot` (integrated mount), `./RemoteBridge` (isolated mount), `./runtime` (metadata), `./preload` (prefetch on hover). |
| `SINGLETONS` | Shared with the host — only where object identity matters: `react`, `react-dom`, `react-router` (+ `/dom`), `@emotion/react`, `@emotion/styled`, `@mui/joy`, `@portal-poc/ds`, with the ranges the host supports. |
| `NEVER_SINGLETONS` | Bundled into every app, never shared: `@tanstack/react-query`, `react-hook-form`, `zod`, `@portal-poc/platform-runtime`. Declaring them shared fails verify. |
| `SUPPORTED_CONTRACT_VERSIONS`, `SUPPORTED_CONTRACT_PACKAGE_RANGE` | Contract versions / npm range the platform supports. |
| `SUPPORTED_BUILD_TOOLING` | Vite and `@module-federation/vite` ranges: the manifest format comes from the plugin, so it is a build-time singleton. |
| `REMOTE_NAME_PATTERN` | Lower-case JS identifier (MF global name). |
| `BRIDGE_BUILD_SUFFIX`, `toBridgeRemoteName` | The bridge build (`<name>_bridge`): same remote, nothing shared, published next to the main build; the host falls back to it. |
| `createSharedConfig` | The `shared` section for the MF plugin: exactly the singletons. |
| `HostCompat` | What a host deployment provides (`compat.json`): singletons with versions, contract range, tooling, version + commit. |
| `findSingletonConflicts`, `findToolingProblem`, `describeConflict` | The checks behind gate 2 (deploy) and gate 3 (browser). |

Changing a singleton or a range is a platform release that touches every app: see
[ADR 0001 — MF singletons](../../docs/adr/0001-mf-singletons.md) and
[0019 — build tooling is a build-time singleton](../../docs/adr/0019-build-tooling-singleton.md).
