import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { ViteUserConfig } from 'vitest/config';

type PortalVitestOptions = {
  environment?: 'node' | 'jsdom';
  setupFiles?: string[];
};

/** What @portal-poc/vite-config injects at build time, so modules that read it at import time load in tests too. */
const appVersion = (): string => {
  try {
    const { version }: { version?: string } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
    return version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
};

/** Shared Vitest defaults. Apps and packages may spread or ignore this. */
export const createVitestConfig = (options: PortalVitestOptions = {}): ViteUserConfig =>
  defineConfig({
    define: { PORTAL_APP_VERSION: JSON.stringify(appVersion()) },
    test: {
      environment: options.environment ?? 'node',
      setupFiles: options.setupFiles ?? [],
      include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      unstubGlobals: true,
      // @portal-poc libraries are published for bundlers (extensionless relative imports): run them through Vite
      // like the app's own code, Node's ESM loader would reject them.
      server: { deps: { inline: [/@portal-poc\//] } },
    },
  });
