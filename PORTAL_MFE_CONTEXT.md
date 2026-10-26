# Portal MFE — full context and requirements for the reference monorepo

> **Historical input, frozen.** This is the original requirements document the PoC was built from; it is not updated.
> Where the PoC differs (React Router v8, axios via `@portal-poc/http` instead of `useHttpClient`, no realtime, stands
> dev3 / dev2 / dev1 / tst instead of dev / test / uat / prod, the event catalog), see
> [`docs/architecture.md`](./docs/architecture.md) → "Deviations" and [`docs/adr/`](./docs/adr).

> This document is the complete context for Claude Code. The task: build a **reference monorepo** (host, remote, platform packages, mock backends, CLI) that demonstrates every architectural decision below. The monorepo will later be split into separate repositories (polyrepo) and adapted to the real code.
>
> Requirement levels: **MUST** — mandatory, **SHOULD** — desirable, **MAY** — optional, **MUST NOT** — forbidden. Every major decision has a "Why", so the motivation is not lost during adaptation.

---

## 0. How to use this document (for Claude Code)

1. Read the whole document before starting. The decisions are connected: for example, dropping the shared QueryClient affects devtools, realtime and preload.
2. Work through the phases in section 20. After each phase, run the checks from section 21.
3. If a requirement contradicts another one or cannot be met with the current library versions, **do not silently invent a workaround**: leave a `TODO(decision)` in the code and record the question in `docs/open-questions.md`.
4. Check the current library APIs against their documentation (MF Vite plugin, React 19.3 `ViewTransition`, TanStack Query v5, React Router v7, MUI Joy, hey-api). The versions in section 2 are targets, but verify the exact signatures.
5. The code style in section 3 is mandatory for all code in the repo.

---

## 1. Project context

### 1.1. What exists today (the real project we will adapt to)

- A micro-frontend portal: **Module Federation + Vite + React 19**, TypeScript, **pnpm**, **MUI Joy UI** (through a design-system wrapper), **TanStack Query v5**, **React Hook Form**, **zod** (form validation through a resolver), **React Router** (not TanStack Router), **React Compiler** (so `useMemo`/`useCallback`/`memo` are forbidden by a lint rule), the **oxlint** linter, **Vitest** tests, **Azure DevOps** CI, Node pinned with **Volta**.
- Backend: the host and every remote have **their own BFF** (Java). The BFFs receive **the same bearer token** the host authenticates with (MSAL / Entra ID). The Java BFFs enrich data from core services; Temporal is used on the Java side.
- Auth: the **MSAL `PublicClientApplication`** lives in the host. Today an http client bound to MSAL comes from the host through a React context (`useHttpClient()`), and its `get/post/put/patch/delete` methods are injected into `queryOptions`/mutation options factories inside hooks.
- Today the **QueryClient is a singleton in the host**, shared by the remotes. Each remote hand-builds a standalone version with its own QueryClient for development and for running outside the host. Cross-app updates (e.g. bookmarks) are done with hacks through the shared QueryClient. **This goes away** (see sections 9, 12).
- React is an MF singleton. MF Bridge is not used yet.
- The application is closed (internal), behind a proxy with additional checks and multi-level bank access systems. Front-end security hardening of remotes is **a low priority for now** (see 8.6).
- Remotes must live in **separate repositories (polyrepo)**: the bank does not want everyone in one repo, and there will be remotes from teams in other clusters. Each remote publishes a static build (Nexus or similar); the host loads it at runtime.
- The team has approved **Feature-Sliced Design v2.1** (pages first): the `app`, `pages`, `shared` layers always; `entities`, `features`, `widgets` on demand.
- The backend wants a **shared repo with OpenAPI specs** from which Java classes and TS types + zod schemas are generated; the front-end part is published as an npm package (see section 15).

### 1.2. Goals of the reference monorepo

- MUST show a working host + at least one remote in **integrated mode** (shared React, shared router; transitions/Suspense/ViewTransition work across the host→remote boundary).
- MUST show the remote's **standalone mode** with the same `RemoteRoot` code.
- MUST show **isolated mode (MF Bridge)** as a fallback (may be an optional phase, see section 20).
- MUST implement the platform packages according to the contract in this document.
- MUST contain mock backends (host BFF, remote BFF, an event broker instead of Kafka, realtime channels) for end-to-end scenarios.
- MUST contain a CLI: remote generation, adding FSD slices, `verify`.
- MUST cover the scenarios in section 19 (they are also the acceptance criteria).

### 1.3. Non-goals

- MUST NOT make a real Entra ID integration required to run the demo: mock auth by default; the MSAL adapter is implemented but enabled by configuration.
- MUST NOT build a shared data cache between applications.
- MUST NOT prefetch remote data from the host now — but the architecture MUST keep this possible (section 13).
- MUST NOT build front-end security isolation of remotes (iframes etc.).

---

## 2. Stack and versions (targets)

| What | Version / choice | Note |
|---|---|---|
| Node | LTS, pinned through Volta in the root `package.json` | if Volta is unavailable (locked-down machine, work in WSL) — duplicate the version in `engines` and `.nvmrc` |
| Package manager | pnpm workspaces | `.npmrc` with a Nexus registry placeholder |
| React / React DOM | **19.3+** | `ViewTransition` is stable since 19.3 (released September 9, 2026, no breaking changes relative to 19.2) |
| React Compiler | enabled | `useMemo`/`useCallback`/`memo` are forbidden |
| Build | Vite + `@module-federation/vite` | check the current MF 2.0 plugin for Vite |
| MF Bridge | `@module-federation/bridge-react` | isolated mode only |
| Routing | React Router v7, **data router** (`createBrowserRouter`) | the data router is needed for `useNavigation`, `lazy`, `loader` (future preload) |
| UI | MUI Joy through the `@portal/ds` package | emotion is a singleton |
| Data | TanStack Query v5 | **not** an MF singleton |
| Forms | React Hook Form + zod resolver | |
| Validation | zod (state the target major explicitly; generation targets it) | |
| API codegen | hey-api (in the `api-contracts` repo) | types + zod, no http client |
| Tests | Vitest + Testing Library; e2e — Playwright (MAY) | |
| Lint | oxlint + Steiger (FSD) | |
| Mock backends | Node.js + Express (or Fastify), TypeScript | |
| TS | `strict: true` in the reference monorepo | strict is currently off in the real project — mark it as a difference in the docs |

---

## 3. Code style (MUST for all code in the repo)

- MUST NOT use `any`. Use library generics for type inference (RHF field paths, `queryOptions` + DataTag for `setQueryData`, etc.). Where a type is unknown — `unknown` + narrowing.
- MUST move logic into named functions instead of writing it inline (handlers, mappers, predicates, selectors).
- MUST always put braces around an `if` body. No one-line `if (x) return y;`.
- MUST use arrow functions instead of `function` declarations (components too: `export const Foo = () => ...`).
- MUST NOT use `useMemo`, `useCallback`, `React.memo` — React Compiler does the work. A rule in oxlint (`no-restricted-imports` or similar).
- RHF: SHOULD use `useWatch`/`useFormState`/`useController` instead of `watch()` (React Compiler compatibility).
- Component files — PascalCase, everything else — kebab-case.
- Public APIs of packages and FSD slices — only through `index.ts`.

---

## 4. Monorepo structure

```
portal-reference/
├─ package.json                 # pnpm workspaces, volta, shared scripts
├─ pnpm-workspace.yaml
├─ .npmrc                       # registry=<NEXUS_PLACEHOLDER>
├─ docs/
│  ├─ architecture.md           # short overview + links to this document
│  ├─ adr/                      # ADRs for the key decisions (section 22)
│  └─ open-questions.md
├─ apps/
│  ├─ host/                     # the host application
│  ├─ tasks-remote/             # remote A (FSD 2.1), generated from the CLI template
│  └─ legacy-remote/            # (opt.) a remote on another React version for the bridge demo
├─ packages/
│  ├─ platform-contract/        # @portal/platform-contract — contract types only
│  ├─ platform-runtime/         # @portal/platform-runtime — providers, factories, hooks, devtools, realtime
│  ├─ ds/                       # @portal/ds — design system (Joy) + loading primitives
│  ├─ mf-shared/                # @portal/mf-shared — (opt.) shared-config helper + exposes constants
│  ├─ presets/                  # @portal/presets — (opt.) tsconfig/oxlint/vitest/steiger presets
│  └─ portal-cli/               # portal-cli — create / add / verify
├─ api-contracts/               # simulation of the backend's shared repo with OpenAPI specs
│  ├─ specs/
│  │  ├─ host-bff.yaml
│  │  └─ tasks-bff.yaml
│  ├─ packages/
│  │  ├─ host-bff-api/          # @portal-api/host-bff  (generated: types + zod)
│  │  └─ tasks-bff-api/         # @portal-api/tasks-bff (generated: types + zod)
│  └─ scripts/                  # generation, spec lint, oasdiff
└─ mock-backend/
   ├─ broker/                   # in-memory event broker instead of Kafka
   ├─ host-bff/                 # the host's BFF: bookmarks aggregate, the host's realtime channel
   └─ tasks-bff/                # the remote's BFF: tasks, the remote's bookmarks, the remote's realtime channel
```

Rules:
- MUST: `apps/*` depend on `packages/*` and `api-contracts/packages/*` through `workspace:*`, but **application code must not know it lives in a monorepo**: no relative imports between applications, only packages. This is needed to split into a polyrepo later without rewriting.
- MUST: `apps/tasks-remote` must be **equivalent to the output of `portal-cli create remote tasks`** (section 16). Ideally generated by it and then extended with demo features.
- MUST: every `apps/*` builds and runs independently (`pnpm --filter <app> dev|build|preview`).

---

## 5. Code delivery levels (who owns what)

| Level | What | Delivery | Can a remote change it? |
|---|---|---|---|
| Runtime singletons | `react`, `react-dom`, `react-router`, `@emotion/react`, `@emotion/styled`, `@mui/joy`, `@portal/ds` | MF shared, `singleton: true`, version range | No, only within the range |
| Versioned packages (bundled into every app) | `@portal/platform-contract` (types), `@portal/platform-runtime`, TanStack Query, RHF, zod | npm, each app has its own version | The version — yes |
| API contract | `@portal-api/<bff>` (types + zod) | npm from the backend's shared repo | The version — yes; may write types by hand |
| Integration contract | the remote's name, expose names and signatures, the list of shared singletons and their ranges, the `platform-contract` version | CLI template + `portal-cli verify` + the host's runtime check | No |
| Internal configs | tsconfig, oxlint, Steiger, Vitest, the rest of Vite, the pipeline | CLI template (generated once), presets — optional | Yes, freely |

**Why:** we make a singleton only where **object identity** must match between the host's tree and the remote's tree (React contexts: router, emotion/Joy theme, DS). Everything that can be passed as a value goes through the contract as props. Everything that must be the same but does not need shared identity is a versioned package. This minimizes imposing a stack on other teams.

A separate tension: a DS singleton means everyone is on one DS major. Mitigation: a Joy theme on CSS variables, so visual consistency rests on tokens (record it in `open-questions.md`).

---

## 6. The `@portal/platform-contract` package (types only)

MUST contain **only types and one contract-version constant** (no other runtime code, zero dependencies on TanStack Query/MSAL/React). It is the only thing all teams must agree on.

```ts
// packages/platform-contract/src/index.ts

export const PLATFORM_CONTRACT_VERSION = 1 as const; // the only constant; acceptable as a const type
export type PlatformContractVersion = typeof PLATFORM_CONTRACT_VERSION;

export type PlatformContract = {
  contractVersion: PlatformContractVersion;
  auth: PlatformAuth;
  env: PlatformEnv;
  events: PlatformEventBus;
  telemetry: PlatformTelemetry;
  locale: PlatformLocale;
  devtools?: PlatformDevtools;
  bridge?: PlatformBridgeOptions; // isolated mode (MF Bridge) only
};

// ---------- auth ----------
export type PlatformAccount = {
  id: string;
  username: string;
  displayName: string;
  tenantId?: string;
  claims?: Readonly<Record<string, unknown>>;
};

export type PlatformAuthEvent =
  | { type: 'login'; account: PlatformAccount }
  | { type: 'logout' }
  | { type: 'account-changed'; account: PlatformAccount }
  | { type: 'token-refresh-failed'; reason: string };

export type PlatformAuth = {
  /** Returns an access token for the scopes. Scopes are checked against the remote's allowlist. Never starts interaction itself. */
  getAccessToken: (scopes: readonly string[]) => Promise<string>;
  getAccount: () => PlatformAccount | null;
  subscribe: (listener: (event: PlatformAuthEvent) => void) => () => void;
  /** Asks the host to run interactive login/consent (redirect). A remote does NOT do redirect/popup itself. */
  requestInteraction: (scopes: readonly string[]) => Promise<void>;
};

// ---------- env ----------
export type PlatformEnv = {
  name: 'local' | 'dev' | 'test' | 'uat' | 'prod' | (string & {});
  /** A remote takes the addresses of specific BFFs from its own runtime config; the host does not know them. */
  hostOrigin: string;
};

// ---------- local event bus (browser, between applications) ----------
export type PlatformEventMap = {
  'bookmarks.changed': { source: string; correlationId?: string };
  // extended through declaration merging in applications
};

export type PlatformEventBus = {
  emit: <TName extends keyof PlatformEventMap>(name: TName, payload: PlatformEventMap[TName]) => void;
  subscribe: <TName extends keyof PlatformEventMap>(
    name: TName,
    listener: (payload: PlatformEventMap[TName]) => void,
  ) => () => void;
};

// ---------- telemetry ----------
export type PlatformTelemetry = {
  logError: (error: unknown, context?: Readonly<Record<string, unknown>>) => void;
  trackEvent: (name: string, properties?: Readonly<Record<string, unknown>>) => void;
};

// ---------- locale ----------
export type PlatformLocale = {
  language: string; // 'en' | 'fr' | ...
  subscribe: (listener: (language: string) => void) => () => void;
};

// ---------- devtools ----------
/** A remote mounts ITS OWN devtools into a host DOM container. The host does not receive a QueryClient. */
export type MountDevtoolsPanel = (container: HTMLElement) => () => void;

export type PlatformDevtools = {
  /** Registers a panel (called when the remote's QueryClient is created). Returns an unregister function. */
  registerPanel: (name: string, mount: MountDevtoolsPanel) => () => void;
  /** Marks that the application's routes are mounted right now (for auto-selection). Returns an "unmounted" function. */
  markMounted: (name: string) => () => void;
};

// ---------- bridge (isolated mode) ----------
export type PlatformBridgeOptions = {
  basename: string;
  navigateToHost: (path: string) => void;
};
```

Requirements:
- MUST NOT include `realtime` in the contract: each application has its own connection to its own BFF (section 12).
- MUST NOT include an http client in the contract: a remote builds it itself from `auth.getAccessToken` and the address of its BFF (the host must not know the remotes' BFF addresses).
- MUST NOT include a QueryClient or TanStack types in the contract.
- Contract evolution: SHOULD be additive only; a breaking change → bump `PLATFORM_CONTRACT_VERSION`, the host supports a range of versions (section 17).

---

## 7. The `@portal/platform-runtime` package

Bundled into every application (NOT a singleton). The `PlatformProvider` context **does not have to** be a singleton, because a remote always wraps itself in a provider built from its props (section 10.3).

### 7.1. Contents (public API)

```
@portal/platform-runtime
├─ provider/      PlatformProvider, usePlatform, usePlatformAuth, usePlatformEvents, ...
├─ auth/          createRemoteAuth (allowlist), createMsalPlatformAuth (MSAL adapter),
│                 createMockPlatformAuth (for local work/demo), useClearCacheOnAccountChange
├─ http/          createHttpClient
├─ query/         createPortalQueryClient (a factory with shared defaults)
├─ realtime/      createRealtimeClient, RealtimeProvider, useInvalidateOnEvent, useRealtimeStatus
├─ events/        createPlatformEventBus
├─ telemetry/     createConsoleTelemetry (demo)
├─ devtools/      createDevtoolsRegistry, DevtoolsToolbar, createQueryDevtoolsMount, useMarkMounted
├─ standalone/    createStandalonePlatform
└─ compat/        isSameReactInstance, isContractVersionSupported
```

### 7.2. `createPortalQueryClient`

- MUST be a **factory**, not an instance.
- Defaults (SHOULD, open to discussion): a sensible `staleTime` (e.g. 30 s); `retry` — do not retry 401/403/404 and zod validation errors, retry network errors/5xx up to 2 times; `refetchOnWindowFocus: true` (a safety net for missed realtime events); a shared `onError` in `QueryCache`/`MutationCache` → `telemetry.logError`.
- Accepts options to override them.

### 7.3. `createHttpClient`

```ts
type HttpClientOptions = {
  baseUrl: string;
  scopes: readonly string[];
  auth: PlatformAuth;
  telemetry?: PlatformTelemetry;
};
// returns { get, post, put, patch, delete } with generics and a required zod schema for the response:
// get: <TSchema extends z.ZodType>(path: string, schema: TSchema, init?: RequestOptions) => Promise<z.infer<TSchema>>
```
- MUST add `Authorization: Bearer <token>` from `auth.getAccessToken(scopes)`.
- MUST validate the response with the zod schema (backend responses are a trust boundary).
- MUST, on 401, retry the request once after getting the token again; if it is 401 again and `InteractionRequired` — call `auth.requestInteraction(scopes)`.
- MUST support `X-Correlation-Id` (generated on mutations, section 12.5).
- MUST support `AbortSignal` (TanStack passes `signal` to `queryFn`).
- The methods are injected into `queryOptions`/mutation options factories inside hooks (keeping the project's current convention).

### 7.4. Auth adapters

- `createMsalPlatformAuth(pca)` — a `PlatformAuth` implementation on top of **one** `PublicClientApplication`. `subscribe` wraps `pca.addEventCallback`/`removeEventCallback`, mapping to `PlatformAuthEvent`. `getAccessToken` — `acquireTokenSilent` with the active account. `requestInteraction` — a centralized `acquireTokenRedirect` (one interaction point in the host).
- `createRemoteAuth(baseAuth, remoteName, allowedScopes)` — a wrapper per remote: checks scopes against the allowlist, throws on a forbidden scope; on `InteractionRequiredAuthError` it does not run interaction itself but forwards to `requestInteraction`.
- `createMockPlatformAuth({ account, tokenTtlMs })` — fake tokens (an opaque string with exp), login/logout/account-changed events from a button in the demo panel. Used by default in the demo.
- `useClearCacheOnAccountChange(platform, getQueryClient)` — calls `queryClient.clear()` on `logout`/`account-changed`.

MSAL rules (MUST, document in `docs/adr`):
- One `PublicClientApplication` per app registration on the page. A second instance with the same clientId → `interaction_in_progress` and broken redirects.
- Interactive login — **the host only**.
- Tokens MUST NOT end up in a URL (query string), neither in http nor in realtime.

Remotes that "need their own auth" (a real problem: some remotes were integrated after the fact and use auth different from the host's global one). Document three cases:
1. **Same tenant, another API.** No separate auth is needed: the host gets a token for their API's scopes through `getAccessToken`; the host's app registration is granted permissions to their API (admin consent). This MUST be the default path.
2. **A team's own app registration.** Preferably reduce it to case 1. If impossible — a second PCA with a **different** clientId is acceptable only in silent mode: `ssoSilent` with a `loginHint` from the host's account, no redirect/popup from the remote. `ssoSilent` uses a hidden iframe → check it with third-party cookies blocked in the bank's browser. In the demo — MAY an example `createSecondaryMsalAuth` adapter, off by default.
3. **Another IdP / another cluster.** A backend task: the front end hands over the host's token, the remote's BFF exchanges it through On-Behalf-Of. This removes the "zoo" of auth flows from the browser. Long term for the bank — discuss a BFF that holds the tokens (cookie session), so there are no tokens in the browser at all.

The source of truth for permissions is the backend (example: the allowed-actions endpoint `process-actions`). Access gates in the UI are for convenience, not protection; they are implemented with suspense queries for permissions inside the application and use the same delayed fallback.

### 7.5. `createPlatformEventBus`

- A `PlatformEventBus` implementation on `EventTarget`/`CustomEvent` within a tab. MAY a `BroadcastChannel` option for cross-tab delivery (off by default: server realtime covers cross-tab).
- Used as an **optional fast path** (section 12.5), not as the main invalidation mechanism.

### 7.6. Realtime (section 12 — in detail)

`createRealtimeClient({ url, auth, scopes, telemetry, transport })`, `RealtimeProvider`, `useInvalidateOnEvent(topic, queryKeyOrPredicate, options)`, `useRealtimeStatus()`.

### 7.7. Devtools (section 11 — in detail)

`createDevtoolsRegistry()`, `DevtoolsToolbar`, `createQueryDevtoolsMount(queryClient)`.

### 7.8. `createStandalonePlatform(config)`

Builds a full `PlatformContract` for the remote's standalone mode: its own PCA (or mock auth per config), its own event bus, its own telemetry, its own devtools registry. MUST return the same type the host provides, so `RemoteRoot` does not know where it runs.

### 7.9. `compat`

- `isSameReactInstance(remoteCreateElement)` — compares the host's and the remote's `createElement` functions **by reference**. MUST NOT compare the `React.version` string (the same version ≠ the same instance).
- `isContractVersionSupported(version, supportedRange)`.

---

## 8. The `@portal/ds` package (design system + loading primitives)

An MF singleton. A wrapper around MUI Joy + tokens + loading primitives. All loading-indication rules are fixed here as well.

### 8.1. Principles of the loading pattern

- Up to **300 ms** — no loader at all.
- After 300 ms — an indicator at the place of the action (a button) or the fallback spinner.
- After **2 s** — a blocking overlay over the region.
- Indication is delayed **with CSS**, not with JS timers, wherever possible: zero re-renders, only `opacity`/`transform` are animated (the compositor), and it works in Suspense fallbacks too (which have no boolean to delay on).
- `minDuration` (protection against flashing) is emulated in CSS with a short fade-in: if the content arrives right after the threshold, the spinner only reaches a few percent of opacity.
- React 19 throttles revealing Suspense content after a fallback commits (~300 ms, `FALLBACK_THROTTLE_MS`, in dev and prod; `act()` bypasses it, so unit tests do not show it). Consequence: with a spinner delay ≥ 300 ms, fast loads will never show the spinner. Document it in an ADR.
- MUST respect `prefers-reduced-motion`.

### 8.2. `Spinner`

- A `delay` prop (ms), **300** by default; written to the `--spinner-delay` CSS variable. `delay={0}` — no delay (when the delay is handled outside, e.g. in a button).
- CSS:
  ```css
  .spinner {
    --spinner-delay: 300ms;
    animation:
      spinner-in 150ms var(--spinner-delay) both,
      spinner-rotate 800ms linear var(--spinner-delay) infinite;
  }
  @keyframes spinner-in { from { opacity: 0; } to { opacity: 1; } }
  ```
- MUST be used as the default Suspense fallback across the portal (host and remotes), so the nested loaders of the host and the remote look like one loader.

### 8.3. `PendingRegion` + `AsyncButton` (stages without extra renders)

- `PendingRegion({ isPending, children })` sets **one** `data-pending` attribute and `aria-busy`; CSS separates all stages with asymmetric `transition-delay` (a delay on enter, none on exit).
  ```css
  .btn-spinner { opacity: 0; transition: opacity 120ms; }
  [data-pending] .btn-spinner { opacity: 1; transition-delay: 300ms; }

  .pending-overlay { opacity: 0; visibility: hidden; transition: opacity 150ms, visibility 0s 150ms; }
  [data-pending] .pending-overlay { opacity: 1; visibility: visible; transition: opacity 200ms 2s, visibility 0s 2s; }
  ```
- `AsyncButton({ isPending, ... })`: MUST be `disabled` **immediately** on `isPending` (protection against a double submit in the first 300 ms); the visual spinner comes after 300 ms. The spinner sits in the same grid cell as the label → the button's width does not jump.
- The thresholds are CSS variables (`--pending-button-delay: 300ms`, `--pending-overlay-delay: 2s`) and can be overridden.
- The "still loading" announcement for screen readers is **the only place** that needs JS: an `aria-live` region switched on through `useSpinDelay(isPending, { delay: 2000 })` (the `spin-delay` package) or an equivalent.

### 8.4. `useLoadingStage` (the JS variant, when logic needs the stage)

For cases where the stage affects logic/text/analytics (not just visuals):
```ts
type LoadingStage = 'idle' | 'button' | 'blocking';
// implementation: two useSpinDelay with different delays over one isPending, ssr: false
```
SHOULD be used rarely; CSS by default.

### 8.5. `AsyncBoundary`

A generic async boundary: `QueryErrorResetBoundary` + `ErrorBoundary` (react-error-boundary) + `Suspense` with a `Spinner` fallback by default. Props for a custom fallback/error. Errors are rendered through the DS `Alert` (in the real project `Alert` takes `title` as a prop).

### 8.6. Security (accepted risk)

Document in an ADR: remotes run in the same origin and JS realm; the scope allowlist protects against mistakes, not against malice. For now — a **consciously accepted risk** (closed application, proxy, multi-level access, controlled Nexus). The minimum that MUST exist: a CSP with an allowlist of remote sources (`script-src`/`connect-src`) in the host's config.

---

## 9. QueryClient: every application has its own

**Decision:** a shared QueryClient is not needed — the host and every remote only call their own BFF; a shared data cache is not needed. Every remote **always** owns its QueryClient, in every mode.

- MUST: `getRemoteQueryClient(platform)` — a lazy **module-level singleton** in the remote's `shared/api/query-client.ts`. Created on first access (not in the body of `RemoteRoot`), through `createPortalQueryClient()`.
- MUST: when the client is created, the remote registers its devtools panel (`platform.devtools?.registerPanel`) — section 11.
- MUST: `useClearCacheOnAccountChange` in `RemoteRoot`.
- MUST: query keys start with the application's namespace, then a domain scope (`['tasks', 'list', filters]`, `['tasks', 'detail', taskId]`). With separate caches this is no longer required for correctness, but MUST be kept for readability in devtools.
- MUST: keys come from `queryOptions(...)` factories, so `setQueryData(options.queryKey, ...)` infers the type through DataTag without `any`.
- MUST: a remote's own `QueryClientProvider` inside the host's tree does not break transitions/Suspense/ViewTransition — they need a shared React root, not a shared cache. Verify it in the demo.

---

## 10. Module Federation: integration modes

### 10.1. Shared

- MUST be singletons: `react`, `react-dom` (a range, e.g. `^19.3.0`), `react-router` (+ `react-router-dom` if used), `@emotion/react`, `@emotion/styled`, `@mui/joy`, `@portal/ds`.
  - **Why `react-router`:** in integrated mode a remote renders its `<Routes>` inside the host's router; without a shared context object the remote's `useNavigate` does not see the router.
  - **Why emotion/Joy:** the Joy theme lives in the emotion context; two copies → two themes and duplicated styles.
- MUST NOT be singletons: `@tanstack/react-query`, `react-hook-form`, `zod`, `@portal/platform-runtime`. MAY: `@tanstack/react-query` as shared **without** singleton to deduplicate matching versions — an optimization, not a requirement.
- An MF nuance (document it): with a version mismatch, `singleton: true` usually does not load the remote's own copy — it warns and uses the shared instance; `strictVersion: true` → an error. So "share if compatible, otherwise use an own copy" is not guaranteed by configuration → **we solve it with a runtime check** (10.4). Verify the behavior of the specific MF Vite plugin on a stand and write it down in the docs.

### 10.2. The remote's exposes (part of the integration contract)

| Expose | What | Mode |
|---|---|---|
| `./RemoteRoot` | the `RemoteRoot({ platform })` component | integrated (shared React) |
| `./RemoteBridge` | `createBridgeComponent({ rootComponent: RemoteRoot })` | isolated |
| `./runtime` | `export const remoteCreateElement = createElement; export const contractVersion = ...` | compatibility check |
| `./preload` | a `preload(platform, params)` stub | future (section 13) |

MUST: expose names are fixed (constants in `@portal/mf-shared` or in the CLI template) and checked by `portal-cli verify`.

### 10.3. `RemoteRoot` — the same in every mode

```tsx
type RemoteRootProps = { platform: PlatformContract };

export const RemoteRoot = ({ platform }: RemoteRootProps) => {
  useClearCacheOnAccountChange(platform, () => getRemoteQueryClient(platform));
  useMarkMounted(platform, REMOTE_NAME); // devtools autoselect

  return (
    <PlatformProvider value={platform}>
      <QueryClientProvider client={getRemoteQueryClient(platform)}>
        <RealtimeProvider client={getRemoteRealtimeClient(platform)}>
          <RemoteRoutes />
        </RealtimeProvider>
      </QueryClientProvider>
    </PlatformProvider>
  );
};
```

- MUST: the contract **always** arrives as a prop at the entry point; the remote sets up `PlatformProvider` and everything else **itself**. Do not rely on the host's context (in a polyrepo the host's `Provider` and the remote's `useContext` may refer to different context objects → `undefined`).
- MUST: the remote does not know which mode it runs in. The only difference is who built `platform` (the host or `createStandalonePlatform`) and who provided the router.
- Remote routing: in integrated mode — `<Routes>` under the host's `tasks/*` route; in standalone — its own `createBrowserRouter` wrapping the same routes; in bridge — its own router with `platform.bridge.basename`.

### 10.4. Choosing the mode in the host (dual entry + identity check)

```ts
const isSameReactInstance = async (): Promise<boolean> => {
  const runtime = await import('tasks/runtime');
  return runtime.remoteCreateElement === createElement;
};

const loadTasksEntry = async () => {
  if (await isSameReactInstance()) {
    return import('tasks/RemoteRoot');      // integrated mode
  }
  return import('tasks/RemoteBridge');      // isolated mode
};
```
- MUST: one host component `<RemoteApp name="tasks" />` that hides the signature difference (the bridge branch through `createRemoteAppComponent` with the same loader).
- MUST: also check `contractVersion` (section 17). Incompatible → a clear error in `AsyncBoundary`, not a white screen.
- Policy: teams within the `^19.3` range automatically get integrated mode; the rest get isolated mode. Nobody is forced; compatibility is rewarded with better integration.

### 10.5. Limitations of isolated mode (bridge) — document them

- Bridge renders the remote into **its own root** (`createRoot(info.dom)`). Even with a shared React instance, it is a different tree.
- These do not cross the boundary: transitions (the host's `isPending` does not wait for the remote's data), Suspense (the host's fallback stays on the host side, the remote has its own boundary), React context, the host's ViewTransition (it animates only the container; the remote renders asynchronously after the host's commit).
- Only **one** view transition can run per document at a time; a new one interrupts the current one → the host and the remote may interrupt each other's animations.
- Bridge proxies `react-router-dom` through an alias in the build config → still tied to the router; check compatibility with the MF Vite plugin.
- Bridge is **an exception and route-level only** (legacy on another React version, another framework, a bought product). Everything embedded inside the host's pages (widgets, forms, lists) is integrated mode only.
- Weight: every extra React version is another `react-dom-client` (~90+ KB gzip).

---

## 11. TanStack Query devtools in a multi-client environment

**Decision:** the host **does not receive** the remotes' QueryClients. A remote registers a **mount function** for its devtools; the host provides only a DOM container and a switcher.

**Why:** passing the client up couples versions (the host's devtools of one version + the remote's client of another) and gives the host control over someone else's cache (the refetch/reset/remove buttons in devtools).

### 11.1. Remote

```ts
// shared/api/query-client.ts
let queryClient: QueryClient | null = null;

const createAndRegisterQueryClient = (platform: PlatformContract): QueryClient => {
  const client = createPortalQueryClient();
  platform.devtools?.registerPanel(REMOTE_NAME, createQueryDevtoolsMount(client));
  return client;
};

export const getRemoteQueryClient = (platform: PlatformContract): QueryClient => {
  if (!queryClient) {
    queryClient = createAndRegisterQueryClient(platform);
  }
  return queryClient;
};
```

`createQueryDevtoolsMount(client)` (in `platform-runtime`):
- MUST import the devtools dynamically inside `mount` (in the prod bundle it is a separate chunk, loaded only when the panel opens).
- Renders `ReactQueryDevtoolsPanel client={client}` into a **separate root** inside the container (no integration with the host's tree is needed) — or the vanilla `TanstackQueryDevtoolsPanel` from `@tanstack/query-devtools` with `mount/unmount` (check the constructor parameters).
- MUST pass `shadowDOMTarget` (a container with a shadow root) — isolates the styles of different devtools versions.
- Registration happens **when the QueryClient is created**, not when the route mounts (otherwise data loaded before mounting, e.g. by a future preload, is invisible).

### 11.2. Host: registry and toolbar

- `createDevtoolsRegistry()`: `Map<name, { mount, mountCount, registeredAt }>`, `registerPanel`, `markMounted` (a counter, not a boolean — StrictMode double effects, a remote mounted in two places), `subscribe`, `getSnapshot` (an immutable snapshot for `useSyncExternalStore`).
- `DevtoolsToolbar`: its own toggle button + a `<select>` of clients + a slide-out panel container with a shadow root. The floating TanStack button is not used — everyone uses the `*Panel` variants, the host included.
- Auto-selection:
  - exactly one mounted remote → that one;
  - otherwise (host pages only, or several remote widgets) → `host`;
  - a manual choice is pinned and disables auto-switching; the pin is stored in `localStorage` with try/catch.
- States in the select: "● mounted", "○ loaded (cache alive until gcTime)", "📌 pinned". Remotes that are not loaded are not listed (MAY: greyed out from the manifest, no action). Do **not** load a remote on a click in devtools.
- On a selection change: `unmount()` the previous panel, `mount(container)` the next one.
- The host registers its own client under the name `host` once, at the root.
- Prod/stands: the toolbar renders only in dev **or** behind a flag (`?devtools=1` / a key in `localStorage`); the remotes' devtools chunks are loaded lazily then (the production variant `@tanstack/react-query-devtools/production`).
- Standalone: `createStandalonePlatform` sets up the same `DevtoolsToolbar` and registry.
- Bridge remotes: works unchanged (registration through props, own devtools version).
- The same technique (a mount function instead of an object) MAY be used for future dev panels (router, flags, logs).

---

## 12. Realtime and cross-app invalidation

### 12.1. Decision

- **The source of truth for "the data changed" is the backend.** It covers other tabs, other devices and changes from background processes (Temporal), which hacks with a shared QueryClient cannot do.
- **Every application has its own connection to its own BFF** (a backend requirement — bounded context isolation). The host MUST NOT receive events about the remotes' internal data.
- An application's backend **translates** domain events from Kafka into events **about its own client's data**. Rule: an application receives events only about the data it shows itself.

### 12.2. The bookmarks scenario (the reference one)

1. Remote A (tasks) adds a bookmark through **tasks-bff** (`POST /bookmarks`, with `X-Correlation-Id`).
2. tasks-bff stores it and publishes the domain event `bookmark.added { userId, resource, correlationId, eventId }` to the broker (Kafka; in the demo — `mock-backend/broker`).
3. tasks-bff itself sends the event `tasks.bookmarks.changed` on remote A's connection (if the remote shows its own bookmarks).
4. **host-bff** is subscribed to `bookmark.*` in the broker, translates it into an event about its own data, `bookmarks.changed { userId, eventId, correlationId }`, and sends it **only to this user's sessions** on the host's connection.
5. The host, in the bookmarks widget on the home page: `useInvalidateOnEvent('bookmarks.changed', bookmarksQueryOptions().queryKey)` → invalidation → refetch (the host's data comes from host-bff, which aggregates bookmarks from the BFFs).
6. Remote A updates its own cache for its UI immediately (`setQueryData`), without waiting for the event.

### 12.3. Event format

```ts
type RealtimeEnvelope = {
  topic: string;            // 'bookmarks.changed'
  eventId: string;          // unique, for deduplication
  occurredAt: string;       // ISO
  scope?: { userId?: string; entityId?: string };
  correlationId?: string;   // from the X-Correlation-Id of the source mutation
  version?: number;         // MAY: resource version
};
```
- MUST: **thin** events — no data and **no query keys** (the backend does not know the front end's keys). Each application maps a topic to its own keys.
- MUST (FSD 2.1): subscriptions live in the `api` segment of the page (or slice) that shows the data — `useInvalidateOnEvent` is called where the data is displayed. A separate central "topic → key" file is not needed.

### 12.4. The `createRealtimeClient` client

- Transport: **SSE over `fetch`** by default (the native `EventSource` cannot send headers → `Authorization` needs a fetch stream). MAY: a WebSocket transport behind the same interface. The token MUST NOT be in the URL; for WS — in the first message/subprotocol.
- Lifecycle: the connection opens when `RealtimeProvider` mounts (= `RemoteRoot` mounts) or on the first subscription; it closes on unmount with a **grace delay** (e.g. 5–10 s), so quick back-and-forth navigation does not cause reconnects. Subscriptions are ref-counted.
- Reconnection: exponential backoff with jitter. **On connect and reconnect** — invalidate every topic that has subscriptions (events that arrived while there was no connection are lost; nobody guarantees delivery).
- Token: the connection outlives the access token → reconnect with a fresh token before expiry (by `exp`) or when the server closes it. The demo server closes the stream when the token expires.
- Deduplication by `eventId` (an LRU of the last N).
- `useRealtimeStatus()` — `connecting | open | reconnecting | closed` (for debugging / an indicator in the devtools toolbar).
- Safety net: `refetchOnWindowFocus` in the QueryClient defaults.

### 12.5. Optional fast path and deduplication

- MAY: for an instant reaction on the same page, after a successful mutation the remote emits on the local bus `platform.events.emit('bookmarks.changed', { source: 'tasks', correlationId })`; the host invalidates immediately.
- MUST (if the fast path is enabled): the host remembers the `correlationId`s it has handled and skips a server event with the same `correlationId` → no double refetch.
- Default in the demo: the fast path is **off** behind a flag; the delay of the "server" path (usually < 1 s) is enough for bookmarks.

### 12.6. Infrastructure risks (document, verify)

- **Connection limit:** if all BFFs are behind a proxy on one origin, SSE over HTTP/1.1 takes slots from the limit of 6 connections per origin and can block regular requests. HTTP/2 through the proxy or WebSocket is needed. In the demo: the Vite dev proxy + separate BFF ports; in `docs` — a checklist for the bank's proxy (WS upgrade, long-lived connections, SSE buffering).
- A buffering proxy breaks SSE → `Cache-Control: no-cache`, `X-Accel-Buffering: no` (or similar) headers, heartbeat comments every ~15 s.

---

## 13. Preload (not now, but the architecture is ready)

- MUST now: `query-client.ts` and the `queryOptions` factories are **separate modules**, not inside components; the QueryClient is created lazily through `getRemoteQueryClient(platform)`.
- MUST now: the `./preload` expose is reserved (a stub `export const preload = async (_platform, _params) => {}` with a `TODO`); the name is in the exposes constants and checked by `verify`.
- The future design:
  - `preload` loads the remote itself: `import('tasks/preload')` pulls `remoteEntry` and a small chunk; then `preload` calls `getRemoteQueryClient(platform).prefetchQuery(...)`.
  - `./preload` is a small expose: only `query-client`, the `queryOptions` factories, the http client; no UI/DS/routes.
  - MUST: `query-client.ts` is **one module instance** for both exposes (`./preload` and `./RemoteRoot`), otherwise the prefetch fills one client and the UI reads from another. Verify with the MF Vite plugin build (a shared chunk).
  - Triggers: hover/focus on a link; a route `loader` in the data router (a static `loader` + `lazy` for the component run in parallel); warming `remoteEntry` when idle (MF runtime `preloadRemote` — check plugin support).
  - Devtools: the remote shows up in the select as "loaded" from the moment of the prefetch (registration when the client is created).
- In the demo MAY: a flag-enabled example of preload on hover, to check that the architecture is really ready.

---

## 14. Transitions, mutations, navigation, ViewTransition

### 14.1. Suspense queries and key changes

- `useSuspenseQuery` has no `placeholderData`. So that a key change (filter, page, selected entity) does not show the fallback, the key update MUST go through `startTransition` (or `useDeferredValue`).
- The Suspense fallback appears only on the first load of a region.
- Example in the demo: the task list filter in `startTransition`, indication through `isPending` → `PendingRegion`.

### 14.2. Mutations — the default rule

- The pending source for a button is `mutation.isPending`.
- To wait for the data on the same page to update — **return a promise** from `onSuccess`: `onSuccess: () => queryClient.invalidateQueries(...)` (the mutation stays pending until the refetch finishes).
- A transition around a mutation is needed **only** if a **suspending** update follows it: a key change / selecting a new entity / navigating to a suspending screen, or `useOptimistic`/`useFormStatus` are needed.
  - Pitfall: updates after an `await` in an async transition MUST be wrapped in `startTransition` again.
  - An error thrown inside a transition (`mutateAsync` throws) goes to the nearest Error Boundary → catch it inside the action and show it through `mutation.error`/form state.

### 14.3. Mutation → redirect to the list (a real case from the project)

Scenario: create a task → 200 → redirect to the list page, which is refetching at that moment.

- MUST: put the response into the list's cache before navigating; do not wait for the invalidation:
  ```ts
  const addTaskToList = (list: Task[] | undefined, task: Task): Task[] | undefined => {
    if (!list) {
      return list; // no cache → the list honestly suspends with the delayed fallback
    }
    return [task, ...list];
  };

  // onSuccess:
  queryClient.setQueryData(tasksListOptions(http, defaultFilters).queryKey, (prev) => addTaskToList(prev, task));
  void queryClient.invalidateQueries({ queryKey: tasksKeys.lists() });
  navigate(tasksRoutes.list());
  ```
- If the list has filters/sorting/pagination — insert only where the record is certain to belong (the first page with the default sort); everything else — invalidation.
- MUST: the button stages are tied to a **shared** flag: `const isBusy = mutation.isPending || navigation.state !== 'idle'` (`useNavigation()` of the data router). Otherwise, in the cold case, the button "goes out" on the 200 while the page has not changed yet → a second click.

### 14.4. ViewTransition (React 19.3)

- Animations are started only by updates in `startTransition`, `<Suspense>` reveals and `useDeferredValue` updates. A plain `setState` does not animate.
- MUST: **the host owns** route-level view transitions (the host's navigation runs in a transition, `addTransitionType('nav-forward' | 'nav-back')`, classes through `enter`/`exit`). Remotes use `<ViewTransition>` only for local changes inside themselves.
- MUST NOT be mixed with the router's own `viewTransition` flag, and MUST NOT call `document.startViewTransition` manually — React assigns `view-transition-name` and calls the API itself.
- Suspense reveal: wrap the boundary in `<ViewTransition>` → a cross-fade fallback → content.
- Background revalidations: `default="none"`.
- **Data from TanStack Query:** the subscription goes through `useSyncExternalStore` → updates are synchronous, not transitions → they do not animate by themselves. To animate a list:
  ```tsx
  const TaskList = () => {
    const { data } = useSuspenseQuery(tasksListOptions(http, filters));
    const tasks = useDeferredValue(data);
    return (
      <ul>
        {tasks.map((task) => (
          <ViewTransition key={task.id}>
            <TaskRow task={task} />
          </ViewTransition>
        ))}
      </ul>
    );
  };
  ```
- Named (shared element) VTs MUST have the remote's prefix (`name="tasks-task-42"`) — names are unique across the whole document.
- Changing the `key` of a `ViewTransition` that wraps `<Suspense>` remounts the boundary and refetches — avoid it.
- Durations of 150–250 ms (during the transition the old state is a static snapshot; a spinner in the outgoing fallback "freezes").
- MUST: disable group animations under `prefers-reduced-motion`.
- Browsers without the View Transitions API skip the animation; the update goes through.

### 14.5. Other things from React 19.2+

- `<Activity>` SHOULD be used for tabs/task panels: a hidden subtree keeps its state, and suspense queries inside a hidden Activity are warmed up in advance.
- Performance Tracks in Chrome DevTools — to check that key changes run as transitions, not blocking updates. Mention it in the docs.
- No waterfalls: `useSuspenseQueries` for parallel queries; one Suspense boundary per independent region.

---

## 15. API contracts (simulation of the backend's shared repo)

### 15.1. Decision

- The backend keeps a **shared repo with all OpenAPI specs**. Generation in it produces Java classes and TS types + zod schemas. The front-end part is published as npm packages to Nexus.
- Generating types/schemas is **the remote's choice**: a remote pulls its BFF's package and controls the version itself, or writes the types by hand.
- In the monorepo: `api-contracts/` simulates that repo.

### 15.2. Package requirements

- MUST: **one package per BFF** (`@portal-api/host-bff`, `@portal-api/tasks-bff`), versioned independently.
- MUST: a package contains **only types + zod schemas** (+ MAY operation metadata: method, path, operationId). MUST NOT generate an http client/SDK tied to a transport.
- MUST: `zod` is a **peerDependency** with a range for the major the generation targets.
- MUST: semver is set by a machine — `oasdiff` compares the new spec with the old one (removing a field / optional→required = major; adding a field = minor).
- MUST: spec lint (Spectral or similar) — rules for `required` and unique schema names. The real spec today: every field is optional, schema names are duplicated → without lint the zod schemas accept anything, and types have `| undefined` everywhere. Make the demo specs "correct" and add rules that catch these problems.
- MUST: prereleases for parallel front-end and back-end work: a PR with a spec publishes `x.y.z-next.N` under the `next` dist-tag; after the merge — a stable version. In the monorepo — a script that imitates this (MAY: changesets).
- Scripts: `pnpm api:lint`, `pnpm api:diff`, `pnpm api:generate`.

### 15.3. Consumption in an application

- MUST: the package is used **only in the application's `shared/api`**; the rest of the code imports schemas and types from there. Then switching "package ↔ hand-written types" or a major update touches one place.
- MUST: if a team writes types by hand, responses are still validated with zod schemas in `shared/api` (the trust boundary).
- The CLI asks: "use `@portal-api/<bff>` or write the types by hand".

---

## 16. Remote: structure (FSD 2.1) and CLI

### 16.1. FSD 2.1

- The **pages first** model: code lives in the page until it starts being reused; `entities`/`features`/`widgets` are extracted only on reuse. The `app`, `pages`, `shared` layers always exist.
- Steiger (the official FSD linter) in CI; the `insignificant-slice` rule suggests merging a slice used by a single page back into that page.
- The `@x` cross-import notation — **only** on the `entities` layer, minimally.
- Self-contained slices: a feature owns its state, mutations and dialogs; widgets/configs only compose features without importing their internals.
- MUST NOT: the CLI does not create empty `entities/`, `features/`, `widgets/`.

### 16.2. Remote structure

```
tasks-remote/
├─ src/
│  ├─ app/
│  │  ├─ exposes/
│  │  │  ├─ RemoteRoot.tsx       # providers, devtools markMounted, cache reset
│  │  │  ├─ RemoteBridge.tsx     # createBridgeComponent({ rootComponent: RemoteRoot })
│  │  │  ├─ runtime.ts           # remoteCreateElement, contractVersion
│  │  │  └─ preload.ts           # stub (section 13)
│  │  ├─ standalone/
│  │  │  ├─ main.tsx             # createStandalonePlatform + own router + DevtoolsToolbar
│  │  │  └─ config.json          # runtime config of the environments (BFF url, auth mode, scopes)
│  │  ├─ providers/              # Platform, QueryClient, Realtime
│  │  └─ routes/                 # the remote's route tree (one for every mode)
│  ├─ pages/
│  │  ├─ task-list/              # ui/ api/ model/ index.ts
│  │  ├─ task-create/
│  │  └─ task-details/
│  └─ shared/
│     ├─ api/
│     │  ├─ contracts.ts         # re-export from @portal-api/tasks-bff (the single point)
│     │  ├─ http-client.ts       # createHttpClient(auth, bffBaseUrl, scopes)
│     │  ├─ query-client.ts      # getRemoteQueryClient(platform) + devtools registration
│     │  ├─ query-keys.ts        # the 'tasks' namespace
│     │  └─ realtime.ts          # getRemoteRealtimeClient(platform) — own connection to tasks-bff
│     ├─ config/                 # env, runtime config (one build → any stand)
│     ├─ routes/                 # path constants
│     ├─ lib/
│     └─ ui/                     # only what the DS does not have
├─ vite.config.ts                # MF: name, exposes, shared (the integration contract)
├─ tsconfig.json                 # internal, may be changed
├─ .oxlintrc.json                # internal (incl. the useMemo/useCallback/memo ban)
├─ steiger.config.ts             # internal
├─ vitest.config.ts              # internal
├─ azure-pipelines.yml           # build → test → steiger → portal-cli verify → publish to Nexus
├─ mocks/auth.ts                 # mock auth for local development
├─ docs/                         # rules for working with React and data
└─ .claude/skills/               # the team's skills for Claude Code
```

- Runtime config: **build once — deploy to any stand**. A build from Nexus MUST NOT bake in the environment. Standalone reads `config.json`; embedded mode gets `env` from the contract and its BFF address from its own runtime config (or a convention relative to `hostOrigin`).

### 16.3. `portal-cli`

Commands:
- `portal-cli create remote <name>` — generates a remote with the structure from 16.2. Questions:
  - use the `@portal-api/<bff>` API package or write types by hand;
  - inline the internal configs into the project or inherit them from `@portal/presets` (optional);
  - include the bridge entry (yes by default).
- `portal-cli add page|widget|feature|entity <name>` — a slice with segments and `index.ts`.
- `portal-cli verify` — checks the **integration contract** (section 17.1). Runs in the remote's CI.
- MAY: `portal-cli doctor` — extended convention checks; a "move it out of the page" hint on reuse.

Principles:
- Generated code is the team's property; nobody syncs the template after generation.
- Internal configs (TS, lint, tests, Vite except the MF section, the pipeline) can be changed freely.
- **`verify` is the only permanent consistency mechanism** — invest in it, not in template updates.

---

## 17. Compatibility and checks

### 17.1. `portal-cli verify` (the remote's CI)

Reads the built `mf-manifest.json` (and `package.json`) and checks:
- MUST: the remote's name follows the convention.
- MUST: the `./RemoteRoot`, `./RemoteBridge`, `./runtime`, `./preload` exposes are present.
- MUST: the singletons are declared `singleton: true` with ranges that intersect the ones the host supports (the list and the ranges — in `@portal/mf-shared` or in the verify config).
- MUST: `@tanstack/react-query` is **not** declared a singleton.
- MUST: the `@portal/platform-contract` version is within the supported range.
- SHOULD: the build contains no tokens/secrets, and `config.json` contains no environment-specific values beyond the template.
- Output: a human-readable report + a non-zero exit code on violations.

### 17.2. The host's check at load time

- React identity (`./runtime`) → integrated or bridge mode.
- `contractVersion` → supported, or a clear error in `AsyncBoundary`.
- A remote loading error (network, 404 remoteEntry) → `AsyncBoundary` with retry, without bringing the host down.

---

## 18. The host application

- `apps/host`: React 19.3, data router, `@portal/ds`, its own QueryClient (`createPortalQueryClient`), one PCA (or mock auth per config), `createRemoteAuth` for each remote with its own scope allowlist.
- Building the contract: `buildPlatformForRemote(remoteName)` → `{ contractVersion, auth: createRemoteAuth(...), env, events, telemetry, locale, devtools: registry (dev/flag), bridge? }`.
- Routes: `/` — the home page with the **bookmarks widget** (data from host-bff, `useInvalidateOnEvent('bookmarks.changed', ...)`); `/tasks/*` — the tasks remote through `<RemoteApp name="tasks" />` (lazy, `AsyncBoundary`, `Spinner` fallback); MAY `/legacy/*` — the bridge remote.
- The host's navigation runs in a transition, `addTransitionType` for the direction, `<ViewTransition>` at the layout level.
- The host's realtime — its own connection to host-bff.
- `useClearCacheOnAccountChange` for the host's QueryClient.
- `DevtoolsToolbar` (dev or flag); the host registers its own client as `host`.
- Demo panel (dev): switch account / logout (mock auth), enable the events fast path, toggle an artificial BFF delay (to check the 300 ms / 2 s stages), enable the preload demo.
- A CSP config (meta or dev-server headers) with an allowlist of remote sources.

---

## 19. Demo scenarios = acceptance criteria

Every scenario MUST be reproducible by hand (described in `docs/demo.md`) and SHOULD be covered by a test (unit/integration with Vitest; e2e with Playwright — MAY).

1. **Button loading stages.** Creating a task with a 100 ms BFF delay → no spinner; 800 ms → a spinner on the button after 300 ms; 3 s → a region overlay after 2 s. The button is `disabled` from the first instant.
2. **Delayed Suspense fallback.** The first visit to `/tasks` with a 150 ms delay → the spinner does not appear; 1 s → the spinner appears smoothly. The fallbacks of the host (loading the remote) and of the remote (data) look the same.
3. **Filter change without a fallback.** A list filter → the old list stays, `PendingRegion` shows pending according to the thresholds.
4. **Create → redirect.** List in the cache: after the 200 the list immediately contains the new task, with no spinner and no "jumping in". No cache (direct visit to the form): the list suspends with the delayed fallback; the button stays busy until the navigation completes.
5. **List animation.** A new task that arrives through a background refetch appears smoothly (`useDeferredValue` + `ViewTransition`); under `prefers-reduced-motion` — without animation.
6. **Bookmarks through the backend.** Add a bookmark in the tasks remote → the host's bookmarks widget updates through host-bff realtime (< 1–2 s). The host receives no `tasks.*` events. In a second tab the widget updates too.
7. **Fast path + deduplication.** With the flag on: the host's widget updates instantly, and the server event with the same `correlationId` does not cause a second refetch.
8. **Reconnection.** Stop host-bff, add a bookmark through tasks-bff, start host-bff → after reconnecting, the widget is invalidated and shows the current data.
9. **Token expiry.** A mock token with a short TTL → realtime reconnects with a fresh token without losing subscriptions.
10. **Account switch.** Logout / account switch in the demo panel → the host's and the remote's caches are cleared, data is reloaded for the new account.
11. **Scope allowlist.** A remote trying to request a token for someone else's scope → an error with a clear message in telemetry.
12. **Devtools.** On the home page — the host's devtools; on `/tasks` — the remote's devtools automatically; back on the home page — the remote is listed as "○ loaded"; pinning the remote disables auto-switching and survives a reload; remotes that are not loaded are not shown.
13. **Standalone.** `pnpm --filter tasks-remote dev:standalone` starts the same `RemoteRoot` with its own PCA/mock auth, its own router and the same devtools toolbar.
14. **Integration modes.** A remote on the same React → integrated mode (the host's transitions wait for the remote's data). (Opt.) `legacy-remote` on another React version → bridge mode automatically; the documented limitations are visible (its own fallback, no shared transitions).
15. **Incompatible contract.** A remote with a `contractVersion` outside the range → a clear error in `AsyncBoundary`, the host keeps working.
16. **verify.** Remove the `./preload` expose or make `@tanstack/react-query` a singleton → `portal-cli verify` fails with a clear report.
17. **API contracts.** Change a spec (remove a field) → `pnpm api:diff` detects a major; the spec lint catches optional-everywhere and duplicate names.
18. **(Opt.) Preload readiness.** With the flag: hovering a link to `/tasks` loads `./preload`, the data is in the cache before the navigation, `useSuspenseQuery` does not suspend; the remote is visible in devtools as "loaded" before it mounts.

---

## 20. Implementation phases

0. **Skeleton.** pnpm workspaces, Volta, `.npmrc`, base presets, `docs/` (architecture, adr, open-questions).
1. **Contract and runtime.** `platform-contract` (types), `platform-runtime`: provider, auth adapters (mock + MSAL), `createRemoteAuth`, http client, `createPortalQueryClient`, event bus, telemetry, compat. Unit tests.
2. **DS.** Joy theme, `Spinner`, `PendingRegion`, `AsyncButton`, `AsyncBoundary`, `useLoadingStage`, delay tokens, reduced motion. Tests (fake timers + checking attributes/classes).
3. **API contracts.** host-bff and tasks-bff specs, types+zod generation, lint, diff, packages with a zod peer.
4. **Mock backends.** broker, host-bff (bookmarks aggregate, the host's SSE channel, event translation), tasks-bff (tasks, bookmarks, the remote's SSE channel), a controllable delay, token checks, closing the stream on exp.
5. **The tasks remote** (FSD 2.1): `RemoteRoot`, exposes, standalone, list/create/details pages, scenarios 1–5.
6. **Host**: routing, `<RemoteApp>` with dual entry, the contract, the bookmarks widget, route-level ViewTransition, the demo panel.
7. **Realtime**: `createRealtimeClient`, `useInvalidateOnEvent`, scenarios 6–9.
8. **Devtools**: registry, toolbar, mount functions, scenario 12.
9. **CLI**: `create remote` (template = tasks-remote), `add`, `verify`; scenario 16. Check that a freshly generated remote passes `verify` and runs.
10. **(Opt.) Bridge demo** (`legacy-remote`), preload demo (flag).
11. **Documentation**: `docs/demo.md`, ADRs, a checklist for the bank's proxy, differences between the reference and the real project.

---

## 21. Checks after every phase

- `pnpm -r typecheck`, `pnpm -r lint` (oxlint + Steiger for applications), `pnpm -r test`, `pnpm -r build`.
- No `any`, no `useMemo`/`useCallback`/`memo`, every `if` with braces, arrow functions only.
- Applications do not import each other directly (packages only).
- For phases 5+: a manual run of the corresponding scenarios from section 19.
- `portal-cli verify` passes for `tasks-remote`.

---

## 22. ADRs to write in `docs/adr/`

1. MF singletons: the minimal list and why (context identity).
2. Integrated mode by default, bridge as a route-level exception; dual entry + React identity check.
3. The platform contract is passed as props; the remote sets up its providers itself.
4. Every application has its own QueryClient; a factory in the runtime package.
5. Auth: one PCA, interaction only in the host, scope allowlist, no tokens in URLs; the accepted security risk + CSP.
6. Loading pattern: CSS delays, 300 ms / 2 s stages, Suspense throttling in React 19.
7. Transitions and mutations: when `mutation.isPending`, when a transition; `setQueryData` before a redirect; a shared busy flag with navigation.
8. ViewTransition: the host owns routes, `useDeferredValue` for TanStack data, name prefixes.
9. Devtools: mount functions instead of passing the client.
10. Realtime: a connection per application, event translation on the backend, thin events, invalidation on reconnect, transport and proxy.
11. Preload: modular readiness without an implementation.
12. API contracts: a package per BFF, types+zod without a client, zod as a peer, oasdiff, Spectral, prereleases.
13. FSD 2.1 pages first, Steiger, a CLI without empty layers.
14. CLI: the template is the team's property; `verify` is the only permanent consistency mechanism.

---

## 23. Open questions (move to `docs/open-questions.md`)

- React/DS version policy: who upgrades first (the host), the deadline for remotes, what happens to laggards (automatic bridge or a block).
- Criteria for admitting bridge, and who approves them.
- DS singleton vs stack freedom: move the theme to CSS variables?
- Contract versioning: additive changes only, or explicit support of several `contractVersion`s by the host.
- Realtime transport through the bank's proxy: HTTP/2? WS upgrade? SSE buffering?
- Where each BFF's realtime gateway lives (in the BFF itself or a separate service per cluster) — a backend decision.
- Where the generated API code finally lives (a package from the specs repo — preferred).
- Whether `portal-cli doctor` / codemods are needed when the contract changes.
- The behavior of `singleton`/`strictVersion` in the chosen MF Vite plugin, and a shared chunk for `query-client.ts` between exposes.
- The status of `@tanstack/react-devtools` (it was alpha) — do we use the single shell or only our own toolbar (current decision: our own toolbar, no dependency on the alpha).

---

## 24. Differences between the reference monorepo and the real project (record them in the docs)

- A monorepo instead of a polyrepo — for convenience only; package and application boundaries are kept as in a polyrepo.
- `strict: true` in TS (off in the real project).
- Mock auth by default instead of the real Entra ID.
- A mock broker instead of Kafka, Node mock BFFs instead of Java BFFs.
- The API packages are consumed through `workspace:*`, not from Nexus.
- Real project: the host's shared QueryClient and the bookmarks hacks around it are **removed** when migrating to this scheme.
