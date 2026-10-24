import type { QueryClient } from '@tanstack/react-query';
import { createPortalQueryClient, createQueryDevtoolsMount } from '@portal-poc/platform-runtime';
import type { PlatformContract } from '@portal-poc/platform-contract';
import { REMOTE_NAME } from '../config';

let queryClient: QueryClient | null = null;

const createAndRegisterQueryClient = (platform: PlatformContract): QueryClient => {
  const client = createPortalQueryClient({ telemetry: platform.telemetry });
  // Registered when the client is created (not when routes mount): data loaded before mounting is visible too.
  platform.devtools?.registerPanel(REMOTE_NAME, createQueryDevtoolsMount(client));
  return client;
};

/** Lazy module singleton: one QueryClient per remote in every mode; shared by `./RemoteRoot` and future `./preload`. */
export const getRemoteQueryClient = (platform: PlatformContract): QueryClient => {
  if (!queryClient) {
    queryClient = createAndRegisterQueryClient(platform);
  }
  return queryClient;
};
