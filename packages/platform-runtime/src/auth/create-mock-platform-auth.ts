import type { PlatformAccount, PlatformAuth, PlatformAuthEvent } from '@portal-poc/platform-contract';
import { PlatformInteractionRequiredError } from './errors';
import { encodeMockToken } from './mock-token';

export const DEFAULT_MOCK_ACCOUNTS: readonly PlatformAccount[] = [
  { id: 'alice', username: 'alice@bank.example', displayName: 'Alice Analyst', tenantId: 'mock-tenant' },
  { id: 'bob', username: 'bob@bank.example', displayName: 'Bob Banker', tenantId: 'mock-tenant' },
];

const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_REFRESH_MARGIN_MS = 30 * 1000;

type MockPlatformAuthOptions = {
  accounts?: readonly PlatformAccount[];
  /** `null` starts signed out. Defaults to the first account (or the persisted one). */
  initialAccountId?: string | null;
  tokenTtlMs?: number;
  /** Persist the signed-in account across reloads (host only). */
  storageKey?: string;
  now?: () => number;
};

export type MockPlatformAuth = PlatformAuth & {
  readonly accounts: readonly PlatformAccount[];
  login: (accountId?: string) => void;
  logout: () => void;
  switchAccount: (accountId: string) => void;
  getTokenTtlMs: () => number;
  setTokenTtlMs: (ttlMs: number) => void;
};

type CachedToken = {
  token: string;
  expiresAt: number;
};

const readPersistedAccountId = (storageKey: string | undefined): string | null | undefined => {
  if (!storageKey) {
    return undefined;
  }
  try {
    const value = localStorage.getItem(storageKey);
    if (value === null) {
      return undefined;
    }
    return value === '' ? null : value;
  } catch {
    return undefined;
  }
};

const persistAccountId = (storageKey: string | undefined, accountId: string | null) => {
  if (!storageKey) {
    return;
  }
  try {
    localStorage.setItem(storageKey, accountId ?? '');
  } catch {
    // Storage may be unavailable (private mode, blocked site data). Persistence is a convenience only.
  }
};

const toScopeKey = (scopes: readonly string[]): string => scopes.toSorted().join(' ');

/**
 * Fake `PlatformAuth` for local development and the demo (default auth mode).
 * Tokens are opaque strings with `exp`; login/logout/account switching are driven by the host demo panel.
 */
export const createMockPlatformAuth = (options: MockPlatformAuthOptions = {}): MockPlatformAuth => {
  const accounts = options.accounts ?? DEFAULT_MOCK_ACCOUNTS;
  const now = options.now ?? Date.now;
  const listeners = new Set<(event: PlatformAuthEvent) => void>();
  const tokenCache = new Map<string, CachedToken>();
  let tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;

  const findAccount = (accountId: string | null | undefined): PlatformAccount | null =>
    accounts.find((account) => account.id === accountId) ?? null;

  const resolveInitialAccount = (): PlatformAccount | null => {
    const persisted = readPersistedAccountId(options.storageKey);
    if (persisted !== undefined) {
      return findAccount(persisted);
    }
    if (options.initialAccountId === null) {
      return null;
    }
    return findAccount(options.initialAccountId) ?? accounts[0] ?? null;
  };

  let currentAccount = resolveInitialAccount();

  const notify = (event: PlatformAuthEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const setAccount = (account: PlatformAccount | null, event: PlatformAuthEvent) => {
    currentAccount = account;
    tokenCache.clear();
    persistAccountId(options.storageKey, account?.id ?? null);
    notify(event);
  };

  const issueToken = (account: PlatformAccount, scopes: readonly string[]): CachedToken => {
    const issuedAt = now();
    const expiresAt = issuedAt + tokenTtlMs;
    const token = encodeMockToken({
      sub: account.id,
      name: account.displayName,
      preferred_username: account.username,
      scp: scopes,
      iat: Math.floor(issuedAt / 1000),
      exp: Math.floor(expiresAt / 1000),
      jti: crypto.randomUUID(),
    });
    return { token, expiresAt };
  };

  const isFresh = (cached: CachedToken): boolean => {
    const margin = Math.min(MAX_REFRESH_MARGIN_MS, tokenTtlMs * 0.25);
    return cached.expiresAt - now() > margin;
  };

  const getAccessToken: PlatformAuth['getAccessToken'] = async (scopes, requestOptions) => {
    const account = currentAccount;
    if (!account) {
      throw new PlatformInteractionRequiredError(scopes);
    }
    const key = toScopeKey(scopes);
    const cached = tokenCache.get(key);
    if (cached && !requestOptions?.forceRefresh && isFresh(cached)) {
      return cached.token;
    }
    const issued = issueToken(account, scopes);
    tokenCache.set(key, issued);
    return issued.token;
  };

  const login = (accountId?: string) => {
    const account = findAccount(accountId) ?? accounts[0] ?? null;
    if (!account) {
      return;
    }
    setAccount(account, { type: 'login', account });
  };

  const logout = () => {
    setAccount(null, { type: 'logout' });
  };

  const switchAccount = (accountId: string) => {
    const account = findAccount(accountId);
    if (!account || account.id === currentAccount?.id) {
      return;
    }
    setAccount(account, { type: 'account-changed', account });
  };

  return {
    accounts,
    getAccessToken,
    getAccount: () => currentAccount,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // Simulates the host's centralized redirect: signs in the default account when nobody is signed in.
    requestInteraction: async () => {
      if (!currentAccount) {
        login();
      }
    },
    login,
    logout,
    switchAccount,
    getTokenTtlMs: () => tokenTtlMs,
    setTokenTtlMs: (ttlMs) => {
      tokenTtlMs = ttlMs;
      tokenCache.clear();
    },
  };
};
