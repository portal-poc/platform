import { QueryClientProvider } from '@tanstack/react-query';
import type { PlatformContract } from '@portal/platform-contract';
import { PlatformProvider, useClearCacheOnAccountChange, useMarkMounted } from '@portal/platform-runtime';
import { getRemoteQueryClient } from '@/shared/api';
import { REMOTE_NAME } from '@/shared/config';
import { RemoteRoutes } from '../routes/RemoteRoutes';
import { RemoteStyles } from '../styles/RemoteStyles';

export type RemoteRootProps = { platform: PlatformContract };

/**
 * Same entry for every mode. The contract ALWAYS comes as a prop and the remote raises its own providers:
 * in polyrepo the host's Provider and the remote's useContext may reference different context objects.
 */
export const RemoteRoot = ({ platform }: RemoteRootProps) => {
  useClearCacheOnAccountChange(platform, () => getRemoteQueryClient(platform));
  useMarkMounted(platform, REMOTE_NAME);

  return (
    <PlatformProvider value={platform}>
      <QueryClientProvider client={getRemoteQueryClient(platform)}>
        <RemoteStyles />
        <RemoteRoutes />
      </QueryClientProvider>
    </PlatformProvider>
  );
};

export default RemoteRoot;
