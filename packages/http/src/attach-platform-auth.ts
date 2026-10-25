import { AxiosHeaders, isAxiosError } from 'axios';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type { PlatformAuth, PlatformContract } from '@portal-poc/platform-contract';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';
export const CLIENT_VERSION_HEADER = 'X-Client-Version';

/** Where requests go and which token they need — per environment, so it may have to load the app's config first. */
export type HttpTarget = { baseUrl: string; scopes: readonly string[] };

export type PlatformAuthOptions = {
  /** The platform the app is mounted with, read per request (see `createPlatformBinding`). */
  platform: () => PlatformContract;
  /** The BFF of the current environment. Sets `baseURL` unless the request has its own. */
  target: () => HttpTarget | Promise<HttpTarget>;
  /** `name@version` of the calling app, sent as `X-Client-Version` (BFFs log it; later: a compatibility window). */
  clientVersion?: string;
};

/** What the interceptors carry from a request to its retry. */
type PortalRequestConfig = InternalAxiosRequestConfig & {
  portalScopes?: readonly string[];
  portalRetryToken?: string;
};

const MUTATIONS = new Set(['post', 'put', 'patch', 'delete']);

/**
 * By name, not `instanceof`: the error is thrown by the host's auth, i.e. by another copy of the code that defines
 * the class (each app bundles its own).
 */
const isInteractionRequired = (error: unknown): boolean =>
  error instanceof Error && error.name === 'PlatformInteractionRequiredError';

const requiresInteraction = (error: AxiosError): boolean => {
  const challenge = String(error.response?.headers['www-authenticate'] ?? '');
  return challenge.includes('interaction_required') || challenge.includes('insufficient_claims');
};

const refreshToken = async (auth: PlatformAuth, scopes: readonly string[]): Promise<string> => {
  try {
    return await auth.getAccessToken(scopes, { forceRefresh: true });
  } catch (error) {
    // Only the host may log in (redirect): ask it, the request fails and is retried after the login.
    if (isInteractionRequired(error)) {
      await auth.requestInteraction(scopes);
    }
    throw error;
  }
};

/**
 * Binds an axios instance the app created with ITS settings (timeouts, own interceptors, adapters) to the host's
 * login: a bearer token for the target's scopes on every request, one retry with a force-refreshed token after 401,
 * the host asked to log in when the BFF or the token cache demand interaction. Mutations get a correlation id unless
 * the caller set one (to reuse it in an event or a log line).
 */
export const attachPlatformAuth = (instance: AxiosInstance, options: PlatformAuthOptions): AxiosInstance => {
  instance.interceptors.request.use(async (config: PortalRequestConfig) => {
    const target = await options.target();
    const headers = AxiosHeaders.from(config.headers);
    const token = config.portalRetryToken ?? (await options.platform().auth.getAccessToken(target.scopes));
    headers.set('Authorization', `Bearer ${token}`);
    if (options.clientVersion) {
      headers.set(CLIENT_VERSION_HEADER, options.clientVersion);
    }
    if (MUTATIONS.has((config.method ?? 'get').toLowerCase()) && !headers.has(CORRELATION_ID_HEADER)) {
      headers.set(CORRELATION_ID_HEADER, crypto.randomUUID());
    }
    return { ...config, baseURL: config.baseURL ?? target.baseUrl, headers, portalScopes: target.scopes };
  });

  instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      throw error;
    }
    const config: PortalRequestConfig = error.config;
    const auth = options.platform().auth;
    const scopes = config.portalScopes ?? [];
    if (config.portalRetryToken) {
      if (requiresInteraction(error)) {
        await auth.requestInteraction(scopes);
      }
      throw error;
    }
    // One retry: the token expired or was revoked on the BFF side.
    return instance.request({ ...config, portalRetryToken: await refreshToken(auth, scopes) } as PortalRequestConfig);
  });

  return instance;
};
