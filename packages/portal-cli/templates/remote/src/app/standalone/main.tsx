import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { DsProvider } from '@portal-poc/ds';
import { createMockPlatformAuth, createStandalonePlatform, DevtoolsToolbar } from '@portal-poc/platform-runtime';
import { REMOTE_NAME } from '@/shared/config';
import { RemoteRoot } from '../exposes/RemoteRoot';

// Standalone = same RemoteRoot, platform built locally. TODO(decision): MSAL mode via own PCA from config.json.
const { platform, devtoolsRegistry } = createStandalonePlatform({
  appName: REMOTE_NAME,
  env: { name: 'local', hostOrigin: window.location.origin },
  auth: createMockPlatformAuth(),
});

const router = createBrowserRouter([{ path: '/*', element: <RemoteRoot platform={platform} /> }]);

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

createRoot(container).render(
  <StrictMode>
    <DsProvider>
      <RouterProvider router={router} useTransitions />
      {devtoolsRegistry && <DevtoolsToolbar registry={devtoolsRegistry} hostName={REMOTE_NAME} />}
    </DsProvider>
  </StrictMode>,
);
