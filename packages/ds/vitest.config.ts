import { createVitestConfig } from '@portal-poc/presets/vitest';

export default createVitestConfig({ environment: 'jsdom', setupFiles: ['./test/setup.ts'] });
