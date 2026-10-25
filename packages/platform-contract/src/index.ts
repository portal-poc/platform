/**
 * Portal platform contract.
 *
 * Types only, plus one version constant. No runtime code, zero dependencies on TanStack Query / MSAL / React.
 * Evolution: additive changes only; a breaking change bumps PLATFORM_CONTRACT_VERSION and the host supports a range.
 */

export const PLATFORM_CONTRACT_VERSION = 1 as const;
export type PlatformContractVersion = typeof PLATFORM_CONTRACT_VERSION;

export type PlatformContract = {
  contractVersion: PlatformContractVersion;
  auth: PlatformAuth;
  env: PlatformEnv;
  events: PlatformEventBus;
  telemetry: PlatformTelemetry;
  locale: PlatformLocale;
  devtools?: PlatformDevtools;
  /** Leave guards: one blocker for the whole page, owned by the host (contract 1.2; absent on older hosts). */
  navigation?: PlatformNavigation;
  /** This app's page title, composed by the host (contract 1.2; absent on older hosts). */
  document?: PlatformDocument;
  /** Only for the isolated mode (MF Bridge). */
  bridge?: PlatformBridgeOptions;
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

export type PlatformTokenRequestOptions = {
  /** Skip the token cache (used once after a 401 from a BFF). Additive extension of contract v1. */
  forceRefresh?: boolean;
};

export type PlatformAuth = {
  /** Returns an access token for the scopes. Scopes are checked against the remote's allowlist. Never starts interaction itself. */
  getAccessToken: (scopes: readonly string[], options?: PlatformTokenRequestOptions) => Promise<string>;
  getAccount: () => PlatformAccount | null;
  subscribe: (listener: (event: PlatformAuthEvent) => void) => () => void;
  /** Asks the host to run interactive login/consent (redirect). A remote never does redirect/popup itself. */
  requestInteraction: (scopes: readonly string[]) => Promise<void>;
};

// ---------- env ----------

export type PlatformEnv = {
  /**
   * The stand the host runs on (`env` of its `/config.json`: `dev3`, `dev2`, `dev1`, `tst`, …); `local` in a remote's
   * standalone mode and when the host dev server has no stand underneath. Apps key their runtime config by it.
   */
  name: string;
  /** BFF addresses come from each remote's own runtime config; the host does not know them. */
  hostOrigin: string;
};

// ---------- local event bus (browser, between applications) ----------

/**
 * In-page transport between applications (host ↔ remotes). It knows names, not payloads: which events exist and
 * what they carry is the event catalog (`@portal-poc/events`), released on its own — a new event never needs a
 * contract release. Publish and subscribe through the catalog's helpers: they validate payloads on both sides, since
 * the publisher and the subscriber are deployed independently.
 */
export type PlatformEventBus = {
  emit: (name: string, payload: unknown) => void;
  subscribe: (name: string, listener: (payload: unknown) => void) => () => void;
};

// ---------- navigation: leave guards ----------

/**
 * "Do not leave this page yet". React Router supports one blocker per router and integrated remotes share the host's
 * router, so apps never block themselves: they register guards here and the host's single blocker (plus a blocker in
 * each own router of a bridge/standalone app) asks them.
 */
export type PlatformLeaveGuard = {
  /** What would be lost, or why leaving is not possible now. Shown by the host's dialog or lock notice. */
  message: string;
  /** Navigations that are not "leaving" (steps of one wizard). Full browser pathname. Default: every one asks. */
  allows?: (pathname: string) => boolean;
  /** Refuse leaving instead of asking (a mutation in flight). Wins over every other guard. */
  lock?: boolean;
  /** The app's own dialog instead of the host's: resolves true = leave. May do async work first (save, then leave). */
  confirm?: (pathname: string) => Promise<boolean>;
};

export type PlatformNavigation = {
  /** While registered, leaving asks first (and reload / tab close get the browser's prompt). Returns release. */
  guard: (guard: PlatformLeaveGuard) => () => void;
  /** Synchronous check for a router's blocker: would going to `pathname` (full browser path) need a decision? */
  isBlocked: (pathname: string) => boolean;
  /** Decides with the guards (lock notice, own dialogs, the host's dialog); true = leave. Concurrent calls share one. */
  confirmLeave: (pathname: string) => Promise<boolean>;
};

// ---------- document ----------

export type PlatformDocument = {
  /** This app's page title; the host composes "<title> · <section> · Portal". null = the section's title. */
  setTitle: (title: string | null) => void;
};

// ---------- telemetry ----------

export type PlatformTelemetry = {
  logError: (error: unknown, context?: Readonly<Record<string, unknown>>) => void;
  trackEvent: (name: string, properties?: Readonly<Record<string, unknown>>) => void;
};

// ---------- locale ----------

export type PlatformLocale = {
  language: string;
  subscribe: (listener: (language: string) => void) => () => void;
};

// ---------- devtools ----------

/** A remote mounts ITS OWN devtools into a host DOM container. The host never receives a QueryClient. */
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
