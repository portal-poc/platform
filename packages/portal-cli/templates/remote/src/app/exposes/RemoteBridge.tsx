import { createBridgeComponent } from '@module-federation/bridge-react/v19';
import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { DsProvider } from '@portal/ds';
import type { PlatformContract } from '@portal/platform-contract';
import { RemoteRoot } from './RemoteRoot';

type BridgeRootProps = { platform: PlatformContract; basename?: string };

/** Isolated mode: own React root → own router (with the host-given basename) and own DS provider. */
const BridgeRoot = ({ platform, basename }: BridgeRootProps) => {
  const [router] = useState(() =>
    createBrowserRouter([{ path: '*', element: <RemoteRoot platform={platform} /> }], {
      basename: platform.bridge?.basename ?? basename ?? '/',
    }),
  );
  return (
    <DsProvider>
      <RouterProvider router={router} useTransitions />
    </DsProvider>
  );
};

export default createBridgeComponent({ rootComponent: BridgeRoot });
