import { createHttpClient, usePlatform } from '@portal-poc/platform-runtime';
import type { HttpClient } from '@portal-poc/platform-runtime';
import type { PlatformContract } from '@portal-poc/platform-contract';
import { REMOTE_NAME, useRemoteEnvConfig } from '../config';
import type { RemoteEnvConfig } from '../config';

let cached: { platform: PlatformContract; http: HttpClient } | null = null;

/** Loaded only where `fakeBackend` is set: environments with a BFF never download it. */
const fakeBackendFetch: typeof fetch = async (input, init) => (await import('./fake-backend')).fakeBackendFetch(input, init);

/** The remote builds its own client from `platform.auth` + its own BFF address (the host does not know it). */
const getRemoteHttp = (platform: PlatformContract, config: RemoteEnvConfig): HttpClient => {
  if (cached?.platform !== platform) {
    cached = {
      platform,
      http: createHttpClient({
        baseUrl: config.bffBaseUrl,
        scopes: config.scopes,
        auth: platform.auth,
        telemetry: platform.telemetry,
        clientVersion: `${REMOTE_NAME}@${PORTAL_APP_VERSION}`,
        ...(config.fakeBackend ? { fetch: fakeBackendFetch } : {}),
      }),
    };
  }
  return cached.http;
};

export const useRemoteHttp = (): HttpClient => getRemoteHttp(usePlatform(), useRemoteEnvConfig());
