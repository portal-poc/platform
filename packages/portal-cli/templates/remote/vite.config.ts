import { createRemoteViteConfig } from '@portal-poc/vite-config';

// The MF section (name, exposes, shared, bridge variant) and the build tooling come from the platform preset.
// Internal Vite settings go into `extend`.
export default createRemoteViteConfig({
  name: '__NAME__',
  port: __PORT__,
  configUrl: import.meta.url,
});
