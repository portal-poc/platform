import type { PlatformContract } from '@portal-poc/platform-contract';

/**
 * Reserved expose (section 13). Future: `getRemoteQueryClient(platform).prefetchQuery(<listOptions>(...))`.
 * Must stay tiny (query-client, queryOptions factories, http client) and share ONE query-client module with RemoteRoot.
 */
// TODO(decision): implement when preload is scheduled; the name is already verified by `portal-cli verify`.
export const preload = async (_platform: PlatformContract, _params: Readonly<Record<string, string>>): Promise<void> => {};
