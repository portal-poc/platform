# @portal-poc/platform-contract

**The typed agreement between the host and every app.** The host builds one `PlatformContract` object per remote and
passes it as a prop (`<RemoteRoot platform={…} />`); the app never reaches into `window` or the host's modules.
Types only plus one constant: no runtime code, no React, no TanStack Query, no MSAL.

```sh
pnpm add @portal-poc/platform-contract
```

You rarely import it directly: `@portal-poc/platform-runtime` gives the hooks (`usePlatform()`, `useLeaveGuard`…).
Import it for types (`PlatformContract`, `PlatformAccount`…) and in code that runs without React.

## What the contract carries

| Field | Type | What for |
|---|---|---|
| `contractVersion` | `1` | The host checks it before mounting (`SUPPORTED_CONTRACT_VERSIONS` in mf-shared). |
| `auth` | `PlatformAuth` | Tokens from the host's single login: `getAccessToken(scopes, { forceRefresh })`, `getAccount()`, `subscribe(event)` (login / logout / account-changed / token-refresh-failed), `requestInteraction(scopes)` — ask the host to log in; an app never redirects itself. Scopes are checked against the app's allowlist from the registry. |
| `env` | `PlatformEnv` | `name` of the stand (`dev3`, `dev2`, `dev1`, `tst`, `local`) — the key apps use to pick their own runtime config (BFF URL, scopes) — and `hostOrigin`. The host does not know your BFF. |
| `events` | `PlatformEventBus` | In-page bus between apps: `emit(name, payload)` / `subscribe(name, listener)`. Use it through `@portal-poc/events` (catalog + validation), not raw. |
| `telemetry` | `PlatformTelemetry` | `logError(error, context)`, `trackEvent(name, props)`: the host's sink (console in the PoC, Application Insights in production). |
| `locale` | `PlatformLocale` | `language` + `subscribe(listener)`. |
| `devtools?` | `PlatformDevtools` | `registerPanel(name, mount)` — the app mounts ITS OWN TanStack devtools into the host's drawer; `markMounted(name)` for auto-selection. Absent on stands without devtools. |
| `navigation?` | `PlatformNavigation` | Leave guards (contract 1.2): `guard({ message, allows, lock, confirm })` → release, `isBlocked(path)`, `confirmLeave(path)`. Apps use `useLeaveGuard`; routers use `PlatformLeaveBlocker`. |
| `document?` | `PlatformDocument` | `setTitle(title)` (contract 1.2): the host composes `<page> · <section> · Portal`. Apps use `usePageTitle`. |
| `bridge?` | `PlatformBridgeOptions` | Only in bridge (isolated) mode: `basename` of the app's own router and `navigateToHost(path)`. |

Optional fields (`?`) may be missing on older hosts: the runtime hooks degrade (no title, guard → `beforeunload`).

## Rules

- **Additive only.** A new field is optional, a new option is optional. Removing or changing a field is a new
  `PLATFORM_CONTRACT_VERSION`; the host then supports a range and remotes migrate (ADR 0003, 0028).
- **Nothing environment-specific in the contract.** BFF addresses, feature flags of an app: the app's own
  `public/config.json`, keyed by `env.name`.
- **Events and their payloads are not in the contract**: they live in the catalog (`@portal-poc/events`), released on
  its own.

Decisions: [ADR 0003 — contract via props](../../docs/adr/0003-contract-via-props.md),
[0005 — auth](../../docs/adr/0005-auth.md), [0024 — leave guards and titles](../../docs/adr/0024-leave-guards-and-page-titles.md).
