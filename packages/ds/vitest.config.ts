import { createVitestConfig } from '@portal/presets/vitest';

export default createVitestConfig({ environment: 'jsdom', setupFiles: ['./test/setup.ts'] });
