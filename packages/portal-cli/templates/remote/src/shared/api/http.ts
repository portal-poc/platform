import { create } from 'axios';
import { attachPlatformAuth, createPlatformBinding } from '@portal-poc/http';
import { getRemoteEnvConfig, REMOTE_NAME } from '../config';

/** The platform this remote is mounted with: bound by `RemoteRoot` (every mode) and `preload`. */
export const remotePlatform = createPlatformBinding(REMOTE_NAME);

const envConfig = () => getRemoteEnvConfig(remotePlatform.get().env.name);

/**
 * The remote's http client: a module-level axios instance with this team's settings, bound to the host's login
 * (bearer token per request, retry after 401, login through the host). Import it anywhere — query and mutation
 * factories, preload, plain modules. The BFF address and scopes come from `public/config.json` per environment.
 */
export const http = attachPlatformAuth(create({ timeout: 15_000 }), {
  platform: remotePlatform.get,
  target: async () => {
    const { bffBaseUrl, scopes } = await envConfig();
    return { baseUrl: bffBaseUrl, scopes };
  },
  clientVersion: `${REMOTE_NAME}@${PORTAL_APP_VERSION}`,
});

/** Loaded only where `fakeBackend` is set: environments with a BFF never download it. */
const fakeBackendFetch: typeof fetch = async (input, init) => (await import('./fake-backend')).fakeBackendFetch(input, init);

// Environments without a BFF yet ("fakeBackend": true in public/config.json) answer from fake-backend.ts.
http.interceptors.request.use(async (config) =>
  (await envConfig()).fakeBackend ? { ...config, adapter: 'fetch', env: { ...config.env, fetch: fakeBackendFetch } } : config,
);
