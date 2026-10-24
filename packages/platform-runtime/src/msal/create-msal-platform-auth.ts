import { EventType, InteractionRequiredAuthError } from '@azure/msal-browser';
import type { AccountInfo, EventMessage, IPublicClientApplication } from '@azure/msal-browser';
import type { PlatformAccount, PlatformAuth, PlatformAuthEvent } from '@portal-poc/platform-contract';
import { PlatformInteractionRequiredError } from '../auth/errors';

type MsalPlatformAuthOptions = {
  /** Scopes requested on interactive login in addition to the ones being asked for. */
  loginScopes?: readonly string[];
};

const toPlatformAccount = (account: AccountInfo): PlatformAccount => ({
  id: account.homeAccountId,
  username: account.username,
  displayName: account.name ?? account.username,
  tenantId: account.tenantId,
  ...(account.idTokenClaims ? { claims: account.idTokenClaims } : {}),
});

const isAccountInfo = (value: unknown): value is AccountInfo =>
  typeof value === 'object' && value !== null && 'homeAccountId' in value && 'username' in value;

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * `PlatformAuth` over ONE `PublicClientApplication` per app registration on the page.
 * A second PCA with the same clientId causes `interaction_in_progress` and broken redirects.
 * Interactive login happens only here (host); remotes reach it through `requestInteraction`.
 */
export const createMsalPlatformAuth = (
  pca: IPublicClientApplication,
  options: MsalPlatformAuthOptions = {},
): PlatformAuth => {
  let interaction: Promise<void> | null = null;

  const getActiveAccount = (): AccountInfo | null => pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;

  const getAccessToken: PlatformAuth['getAccessToken'] = async (scopes, requestOptions) => {
    const account = getActiveAccount();
    if (!account) {
      throw new PlatformInteractionRequiredError(scopes);
    }
    try {
      const result = await pca.acquireTokenSilent({
        scopes: [...scopes],
        account,
        forceRefresh: requestOptions?.forceRefresh ?? false,
      });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        throw new PlatformInteractionRequiredError(scopes, { cause: error });
      }
      throw error;
    }
  };

  const mapEvent = (message: EventMessage): PlatformAuthEvent | null => {
    switch (message.eventType) {
      case EventType.LOGIN_SUCCESS: {
        return isAccountInfo(message.payload) ? { type: 'login', account: toPlatformAccount(message.payload) } : null;
      }
      case EventType.LOGOUT_SUCCESS: {
        return { type: 'logout' };
      }
      case EventType.ACTIVE_ACCOUNT_CHANGED: {
        const account = pca.getActiveAccount();
        return account ? { type: 'account-changed', account: toPlatformAccount(account) } : { type: 'logout' };
      }
      case EventType.ACQUIRE_TOKEN_FAILURE: {
        return { type: 'token-refresh-failed', reason: describeError(message.error) };
      }
      default: {
        return null;
      }
    }
  };

  const subscribe: PlatformAuth['subscribe'] = (listener) => {
    const handleMessage = (message: EventMessage) => {
      const event = mapEvent(message);
      if (event) {
        listener(event);
      }
    };
    const callbackId = pca.addEventCallback(handleMessage);
    return () => {
      if (callbackId) {
        pca.removeEventCallback(callbackId);
      }
    };
  };

  const startRedirect = async (scopes: readonly string[]) => {
    const account = getActiveAccount();
    await pca.acquireTokenRedirect({
      scopes: [...new Set([...scopes, ...(options.loginScopes ?? [])])],
      ...(account ? { account } : {}),
    });
  };

  // Single point of interaction: concurrent callers share one redirect.
  const requestInteraction: PlatformAuth['requestInteraction'] = (scopes) => {
    if (!interaction) {
      interaction = startRedirect(scopes).finally(() => {
        interaction = null;
      });
    }
    return interaction;
  };

  return {
    getAccessToken,
    getAccount: () => {
      const account = getActiveAccount();
      return account ? toPlatformAccount(account) : null;
    },
    subscribe,
    requestInteraction,
  };
};
