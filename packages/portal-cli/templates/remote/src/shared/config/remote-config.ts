import { use } from 'react';
import { z } from 'zod';
import { usePlatformEnv } from '@portal-poc/platform-runtime';

export const REMOTE_NAME = '__NAME__';

const remoteConfigSchema = z.object({
  environments: z.record(
    z.string(),
    z.object({
      bffBaseUrl: z.url(),
      scopes: z.array(z.string()).min(1),
      /** No BFF on this environment yet: answer from `shared/api/fake-backend.ts`. Remove once the BFF exists. */
      fakeBackend: z.boolean().optional(),
    }),
  ),
});

export type RemoteEnvConfig = z.output<typeof remoteConfigSchema>['environments'][string];

/**
 * Runtime config: built once, deployed to any stand. `config.json` ships inside the remote's immutable version folder
 * (`<nexus>/<name>/<version>/config.json`) and holds every environment keyed by `platform.env.name`.
 * Built chunks live in `assets/`, hence `../`; the dev server serves it from the root.
 */
const CONFIG_URL = import.meta.env.DEV ? '/config.json' : '../config.json';

const loadEnvConfig = async (envName: string): Promise<RemoteEnvConfig> => {
  const url = new URL(/* @vite-ignore */ CONFIG_URL, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${REMOTE_NAME}: ${url.href} → HTTP ${response.status}`);
  }
  const envConfig = remoteConfigSchema.parse(await response.json()).environments[envName];
  if (!envConfig) {
    throw new Error(`${REMOTE_NAME}: no runtime config for environment "${envName}"`);
  }
  return envConfig;
};

/** One promise per environment name: `use()` needs the same promise on every render. */
const envConfigs = new Map<string, Promise<RemoteEnvConfig>>();

/** Suspends until the runtime config is loaded. */
export const useRemoteEnvConfig = (): RemoteEnvConfig => {
  const { name } = usePlatformEnv();
  let promise = envConfigs.get(name);
  if (!promise) {
    promise = loadEnvConfig(name);
    envConfigs.set(name, promise);
  }
  return use(promise);
};
