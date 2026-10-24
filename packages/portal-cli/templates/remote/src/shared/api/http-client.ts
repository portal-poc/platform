import { createHttpClient, usePlatform } from '@portal-poc/platform-runtime';
import type { HttpClient } from '@portal-poc/platform-runtime';
import type { PlatformContract } from '@portal-poc/platform-contract';
import { REMOTE_NAME, useRemoteEnvConfig } from '../config';
import type { RemoteEnvConfig } from '../config';
import { fakeBackendFetch } from './fake-backend';

let cached: { platform: PlatformContract; http: HttpClient } | null = null;

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
        fetch: fakeBackendFetch, // PoC: hard-coded backend
      }),
    };
  }
  return cached.http;
};

export const useRemoteHttp = (): HttpClient => getRemoteHttp(usePlatform(), useRemoteEnvConfig());
