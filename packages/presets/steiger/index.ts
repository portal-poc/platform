import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

/**
 * FSD 2.1 "pages first" defaults.
 * `insignificant-slice` stays on: it suggests merging a slice used by a single page back into that page.
 */
export const createSteigerConfig = (): ReturnType<typeof defineConfig> =>
  defineConfig([
    ...fsd.configs.recommended,
    {
      files: ['./src/app/**'],
      rules: {
        // `app/exposes` and `app/standalone` are Module Federation entry points, not FSD slices.
        'fsd/no-reserved-folder-names': 'off',
      },
    },
  ]);
