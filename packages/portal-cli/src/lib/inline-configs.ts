import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseJsonc } from './text.ts';

const require = createRequire(import.meta.url);

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

const readPreset = (path: string): JsonObject => {
  const parsed = parseJsonc(readFileSync(require.resolve(`@portal/presets/${path}`), 'utf8'));
  if (!isObject(parsed)) {
    throw new Error(`Preset ${path} is not a JSON object`);
  }
  return parsed;
};

const mergeDeep = (base: JsonObject, override: JsonObject): JsonObject => {
  const result: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isObject(current) && isObject(value) ? mergeDeep(current, value) : value;
  }
  return result;
};

const withoutExtends = (config: JsonObject): JsonObject => {
  const { extends: _extends, $schema: _schema, ...rest } = config;
  return rest;
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** "Inline" mode: the generated remote owns full copies of the configs instead of extending @portal/presets. */
export const createInlineConfigs = (): Record<string, string> => {
  const tsconfig = ['tsconfig/base.json', 'tsconfig/react-library.json', 'tsconfig/react-app.json']
    .map(readPreset)
    .map(withoutExtends)
    .reduce(mergeDeep, {});
  const compilerOptions = isObject(tsconfig['compilerOptions']) ? tsconfig['compilerOptions'] : {};
  const oxlint = ['oxlint/base.json', 'oxlint/react.json'].map(readPreset).map(withoutExtends).reduce(mergeDeep, {});

  return {
    'tsconfig.json': json({
      compilerOptions: { ...compilerOptions, paths: { '@/*': ['./src/*'] } },
      include: ['src', 'vite.config.ts', 'vitest.config.ts', 'steiger.config.ts'],
    }),
    '.oxlintrc.json': json({ ...oxlint, ignorePatterns: ['dist/**', 'node_modules/**', '.__mf__temp/**'] }),
    '.fallowrc.json': json({ $schema: './node_modules/fallow/schema.json', ...readPreset('fallow/remote.json') }),
    'steiger.config.ts': [
      "import fsd from '@feature-sliced/steiger-plugin';",
      "import { defineConfig } from 'steiger';",
      '',
      'export default defineConfig([',
      '  ...fsd.configs.recommended,',
      "  { files: ['./src/app/**'], rules: { 'fsd/no-reserved-folder-names': 'off' } },",
      ']);',
      '',
    ].join('\n'),
    'vitest.config.ts': [
      "import { fileURLToPath } from 'node:url';",
      "import { defineConfig } from 'vitest/config';",
      '',
      'export default defineConfig({',
      "  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },",
      "  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], restoreMocks: true },",
      '});',
      '',
    ].join('\n'),
  };
};
