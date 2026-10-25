import type { PlatformContract } from '@portal-poc/platform-contract';
import { remotePlatform } from '@/shared/api';

/**
 * Reserved expose (section 13). Future: `getRemoteQueryClient(platform).prefetchQuery(<listOptions>(...))`.
 * Must stay tiny (query-client, queryOptions factories, http client) and share ONE query-client module with RemoteRoot.
 */
// TODO(decision): implement when preload is scheduled; the name is already verified by `portal-cli verify`.
export const preload = async (platform: PlatformContract, _params: Readonly<Record<string, string>>): Promise<void> => {
  // May run before RemoteRoot mounts: the http client needs the platform already.
  remotePlatform.bind(platform);
};
