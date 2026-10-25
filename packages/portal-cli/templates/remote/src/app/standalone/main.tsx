import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { DsProvider } from '@portal-poc/ds';
import { createMockPlatformAuth, createStandalonePlatform, DevtoolsToolbar } from '@portal-poc/platform-runtime';
import { PlatformLeaveBlocker } from '@portal-poc/platform-runtime/router';
import { REMOTE_NAME } from '@/shared/config';
import { RemoteRoot } from '../exposes/RemoteRoot';

// Standalone = same RemoteRoot, platform built locally. TODO(decision): MSAL mode via own PCA from config.json.
const { platform, devtoolsRegistry } = createStandalonePlatform({
  appName: REMOTE_NAME,
  env: { name: 'local', hostOrigin: window.location.origin },
  auth: createMockPlatformAuth(),
});

// Own router: the leave blocker inside it asks the guards (the standalone platform answers with window.confirm).
const element = (
  <>
    <PlatformLeaveBlocker platform={platform} />
    <RemoteRoot platform={platform} />
  </>
);
const router = createBrowserRouter([{ path: '/*', element }]);

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
