import { QueryClientProvider } from '@tanstack/react-query';
import type { PlatformContract } from '@portal-poc/platform-contract';
import { PlatformProvider, useClearCacheOnAccountChange, useMarkMounted } from '@portal-poc/platform-runtime';
import { getRemoteQueryClient, remotePlatform } from '@/shared/api';
import { REMOTE_NAME } from '@/shared/config';
import { RemoteRoutes } from '../routes/RemoteRoutes';

export type RemoteRootProps = { platform: PlatformContract };

/**
 * Same entry for every mode. The contract ALWAYS comes as a prop and the remote raises its own providers:
 * in polyrepo the host's Provider and the remote's useContext may reference different context objects.
 */
export const RemoteRoot = ({ platform }: RemoteRootProps) => {
  // Before anything renders: the module-level http client reads the platform from here.
  remotePlatform.bind(platform);
  useClearCacheOnAccountChange(platform, () => getRemoteQueryClient(platform));
  useMarkMounted(platform, REMOTE_NAME);

  return (
    <PlatformProvider value={platform}>
      <QueryClientProvider client={getRemoteQueryClient(platform)}>
        <RemoteRoutes />
      </QueryClientProvider>
    </PlatformProvider>
  );
};

export default RemoteRoot;
