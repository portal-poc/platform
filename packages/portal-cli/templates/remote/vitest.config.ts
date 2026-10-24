import { fileURLToPath } from 'node:url';
import { createVitestConfig } from '@portal/presets/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(createVitestConfig({ environment: 'jsdom' }), {
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
