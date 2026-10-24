import { use } from 'react';
import { z } from 'zod';
import { usePlatformEnv } from '@portal/platform-runtime';

export const REMOTE_NAME = '__NAME__';

const remoteConfigSchema = z.object({
  environments: z.record(
    z.string(),
    z.object({
      bffBaseUrl: z.url(),
      scopes: z.array(z.string()).min(1),
    }),
  ),
});

export type RemoteEnvConfig = z.output<typeof remoteConfigSchema>['environments'][string];

let configPromise: Promise<z.output<typeof remoteConfigSchema>> | null = null;

/**
 * Runtime config: built once, deployed to any stand. `config.json` is served next to the remote's own assets
 * (absolute path on the remote's origin, so it works both standalone and inside the host).
 */
const loadRemoteConfig = () => {
  if (!configPromise) {
    const url = new URL(/* @vite-ignore */ '/config.json', import.meta.url);
    configPromise = fetch(url)
      .then((response) => response.json())
      .then((json: unknown) => remoteConfigSchema.parse(json));
  }
  return configPromise;
};

const getRemoteEnvConfig = async (envName: string): Promise<RemoteEnvConfig> => {
  const config = await loadRemoteConfig();
  const envConfig = config.environments[envName];
  if (!envConfig) {
    throw new Error(`${REMOTE_NAME}: no runtime config for environment "${envName}"`);
  }
  return envConfig;
};

const envConfigPromises = new Map<string, Promise<RemoteEnvConfig>>();

/** Suspends until the runtime config is loaded. */
export const useRemoteEnvConfig = (): RemoteEnvConfig => {
  const { name } = usePlatformEnv();
  let promise = envConfigPromises.get(name);
  if (!promise) {
    promise = getRemoteEnvConfig(name);
    envConfigPromises.set(name, promise);
  }
  return use(promise);
};
