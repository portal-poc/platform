import { createBridgeComponent } from '@module-federation/bridge-react/v19';
import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { DsProvider } from '@portal-poc/ds';
import type { PlatformContract } from '@portal-poc/platform-contract';
import { PlatformLeaveBlocker } from '@portal-poc/platform-runtime/router';
import { RemoteRoot } from './RemoteRoot';

type BridgeRootProps = { platform: PlatformContract; basename?: string };

/**
 * Isolated mode: own React root → own router (with the host-given basename) and own DS provider. The router gets the
 * platform's leave blocker: guards (`useLeaveGuard`) then hold in-app navigations too, with the host's dialog.
 */
const BridgeRoot = ({ platform, basename }: BridgeRootProps) => {
  const [router] = useState(() => {
    const routerBasename = platform.bridge?.basename ?? basename ?? '/';
    const element = (
      <>
        <PlatformLeaveBlocker platform={platform} basename={routerBasename} />
        <RemoteRoot platform={platform} />
      </>
    );
    return createBrowserRouter([{ path: '*', element }], { basename: routerBasename });
  });
  return (
    <DsProvider>
      <RouterProvider router={router} useTransitions />
    </DsProvider>
  );
};

export default createBridgeComponent({ rootComponent: BridgeRoot });
