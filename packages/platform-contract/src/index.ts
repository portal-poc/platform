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
  name: 'local' | 'dev' | 'test' | 'uat' | 'prod' | (string & {});
  /** BFF addresses come from each remote's own runtime config; the host does not know them. */
  hostOrigin: string;
};

// ---------- local event bus (browser, between applications) ----------

/**
 * Event map of the local bus. Extend it with declaration merging in applications:
 *
 * declare module '@portal/platform-contract' {
 *   interface PlatformEventMap { 'tasks.something': { id: string } }
 * }
 *
 * It is an `interface` (not a `type`) precisely so that declaration merging works.
 */
export interface PlatformEventMap {
  'bookmarks.changed': { source: string; correlationId?: string };
}

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
