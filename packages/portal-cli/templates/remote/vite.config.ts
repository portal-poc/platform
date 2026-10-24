import babel from '@rolldown/plugin-babel';
import { federation } from '@module-federation/vite';
import { createSharedConfig, REMOTE_EXPOSES, toBridgeRemoteName } from '@portal/mf-shared';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const PORT = __PORT__;
const REMOTE_NAME = '__NAME__';

/**
 * Module Federation section = integration contract (name, exposes, shared). Everything else is internal.
 * `--mode bridge` builds the isolated variant (no shared deps, own React/router/DS) into `dist-bridge`.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: PORT, origin: `http://localhost:${PORT}`, cors: true },
  preview: { port: PORT, cors: true },
  build: { target: 'es2023', outDir: mode === 'bridge' ? 'dist-bridge' : 'dist' },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    federation({
      name: mode === 'bridge' ? toBridgeRemoteName(REMOTE_NAME) : REMOTE_NAME,
      filename: 'remoteEntry.js',
      manifest: true,
      dts: false,
      exposes: {
        [REMOTE_EXPOSES.RemoteRoot]: './src/app/exposes/RemoteRoot.tsx',
        [REMOTE_EXPOSES.RemoteBridge]: './src/app/exposes/RemoteBridge.tsx',
        [REMOTE_EXPOSES.runtime]: './src/app/exposes/runtime.ts',
        [REMOTE_EXPOSES.preload]: './src/app/exposes/preload.ts',
      },
      shared: mode === 'bridge' ? {} : createSharedConfig(),
    }),
  ],
}));
