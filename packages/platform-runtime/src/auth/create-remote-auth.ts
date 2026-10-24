import type { PlatformAuth, PlatformTelemetry } from '@portal/platform-contract';
import { isInteractionRequiredError, PlatformScopeNotAllowedError } from './errors';

type RemoteAuthOptions = {
  telemetry?: PlatformTelemetry;
};

const findRejectedScopes = (scopes: readonly string[], allowedScopes: readonly string[]): string[] =>
  scopes.filter((scope) => !allowedScopes.includes(scope));

/**
 * Per-remote wrapper built by the host. Checks scopes against the remote's allowlist and never runs interaction
 * itself: on "interaction required" it forwards to the host's single interactive entry point and rethrows.
 */
export const createRemoteAuth = (
  baseAuth: PlatformAuth,
  remoteName: string,
  allowedScopes: readonly string[],
  options: RemoteAuthOptions = {},
): PlatformAuth => {
  const assertScopesAllowed = (scopes: readonly string[]) => {
    const rejected = findRejectedScopes(scopes, allowedScopes);
    if (rejected.length === 0) {
      return;
    }
    const error = new PlatformScopeNotAllowedError(remoteName, rejected, allowedScopes);
    options.telemetry?.logError(error, { remoteName, rejectedScopes: rejected });
    throw error;
  };

  const getAccessToken: PlatformAuth['getAccessToken'] = async (scopes, requestOptions) => {
    assertScopesAllowed(scopes);
    try {
      return await baseAuth.getAccessToken(scopes, requestOptions);
    } catch (error) {
      if (isInteractionRequiredError(error)) {
        await baseAuth.requestInteraction(scopes);
      }
      throw error;
    }
  };

  return {
    getAccessToken,
    getAccount: baseAuth.getAccount,
    subscribe: baseAuth.subscribe,
    requestInteraction: async (scopes) => {
      assertScopesAllowed(scopes);
      await baseAuth.requestInteraction(scopes);
    },
  };
};
