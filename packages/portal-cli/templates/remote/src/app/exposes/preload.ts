import { matchPath } from 'react-router';
import type { PlatformContract } from '@portal-poc/platform-contract';
import { getRemoteQueryClient, itemsListOptions, remotePlatform } from '@/shared/api';

/**
 * `./preload`: the host calls it when the user is about to open one of our pages (hover / focus on a link), with the
 * path inside this remote. Prefetch what that page shows first into THE QueryClient RemoteRoot uses (one
 * `query-client` module for both exposes), so the click renders from cache. Keep it tiny: query factories and the
 * http client only, no UI. Add a branch per route that loads data (mirror RemoteRoutes).
 */
export const preload = async (platform: PlatformContract, { path }: { path: string }): Promise<void> => {
  // May run before RemoteRoot mounts: the http client needs the platform already.
  remotePlatform.bind(platform);
  if (matchPath({ path: '/', end: true }, path)) {
    await getRemoteQueryClient(platform).prefetchQuery(itemsListOptions());
  }
};
