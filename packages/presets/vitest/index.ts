import { defineConfig } from 'vitest/config';
import type { ViteUserConfig } from 'vitest/config';

type PortalVitestOptions = {
  environment?: 'node' | 'jsdom';
  setupFiles?: string[];
};

/** Shared Vitest defaults. Apps and packages may spread or ignore this. */
export const createVitestConfig = (options: PortalVitestOptions = {}): ViteUserConfig =>
  defineConfig({
    test: {
      environment: options.environment ?? 'node',
      setupFiles: options.setupFiles ?? [],
      include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
      restoreMocks: true,
      unstubGlobals: true,
    },
  });
