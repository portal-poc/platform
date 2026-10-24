import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkbox, confirm } from '@inquirer/prompts';
import { REMOTE_NAME_PATTERN } from '@portal-poc/mf-shared';
import { findWorkspaceRoot, isMissingOrEmptyDir, listFilesRecursive } from '../lib/fs.ts';
import { createInlineConfigs } from '../lib/inline-configs.ts';
import { parseList, toPascalCase } from '../lib/text.ts';

const TEMPLATE_DIR = fileURLToPath(new URL('../../templates/remote', import.meta.url));

/** `app`, `pages`, `shared` are always created; these are optional (FSD 2.1 "pages first"). */
export const OPTIONAL_LAYERS = ['entities', 'features', 'widgets'] as const;

export type CreateRemoteOptions = {
  dir?: string;
  port?: string;
  layers?: string;
  presets?: boolean;
  bridge?: boolean;
  yes?: boolean;
};

type Answers = {
  layers: string[];
  usePresets: boolean;
  withBridge: boolean;
};

const LAYER_DESCRIPTIONS: Record<string, string> = {
  entities: 'Business entities reused by several pages/features (e.g. `entities/user`). `@x` cross-imports only here.',
  features: 'User interactions reused by several pages (e.g. `features/toggle-bookmark`). Own state, mutations, dialogs.',
  widgets: 'Large self-contained UI blocks composed of features/entities, reused by several pages.',
};

const BRIDGE_STUB = `/**
 * The bridge (isolated) entry was disabled when this remote was generated. The expose stays because its name is
 * part of the integration contract; the host only uses it when the React instance differs.
 */
const unsupportedBridge = () => {
  throw new Error('__NAME__ does not support the isolated (MF Bridge) mode.');
};

export default unsupportedBridge;
`;

const askAnswers = async (options: CreateRemoteOptions): Promise<Answers> => {
  const layers =
    options.layers !== undefined
      ? parseList(options.layers)
      : options.yes
        ? []
        : await checkbox({
            message: 'Optional FSD layers to create (app, pages and shared are always created):',
            choices: OPTIONAL_LAYERS.map((layer) => ({ value: layer, name: `${layer} — ${LAYER_DESCRIPTIONS[layer]}` })),
          });
  const usePresets =
    options.presets ??
    (options.yes || (await confirm({ message: 'Inherit internal configs (tsconfig, oxlint, fallow, vitest, steiger) from @portal-poc/presets?', default: true })));
  const withBridge =
    options.bridge ?? (options.yes || (await confirm({ message: 'Include the bridge entry (isolated mode fallback)?', default: true })));
  return { layers, usePresets, withBridge };
};

const assertValidLayers = (layers: string[]) => {
  const unknown = layers.filter((layer) => !OPTIONAL_LAYERS.some((known) => known === layer));
  if (unknown.length > 0) {
    throw new Error(`Unknown layer(s): ${unknown.join(', ')}. Allowed: ${OPTIONAL_LAYERS.join(', ')}.`);
  }
};

const replaceTokens = (text: string, tokens: Record<string, string>): string =>
  Object.entries(tokens).reduce((result, [token, value]) => result.replaceAll(token, value), text);

const writeFile = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

/** Without a bridge entry there is no isolated variant to build or verify. */
const dropBridge = (packageJson: string): string => {
  const parsed: { dependencies?: Record<string, string>; scripts?: Record<string, string> } = JSON.parse(packageJson);
  delete parsed.dependencies?.['@module-federation/bridge-react'];
  if (parsed.scripts) {
    parsed.scripts['build'] = 'vite build';
    parsed.scripts['verify'] = 'portal-cli verify';
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
};

export const runCreateRemote = async (name: string, options: CreateRemoteOptions): Promise<void> => {
  if (!REMOTE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid remote name "${name}": lower-case letters and digits, starting with a letter.`);
  }
  const targetDir = resolve(options.dir ?? `${name}-remote`);
  if (!isMissingOrEmptyDir(targetDir)) {
    throw new Error(`Target directory ${targetDir} is not empty.`);
  }

  const answers = await askAnswers(options);
  assertValidLayers(answers.layers);

  const inWorkspace = findWorkspaceRoot(targetDir) !== null;
  const tokens = {
    __NAME__: name,
    __TITLE__: toPascalCase(name),
    __PORT__: options.port ?? '5176',
    __PORTAL_VERSION__: inWorkspace ? 'workspace:^' : '^1.0.0',
    __REGISTRY__: process.env['PORTAL_REGISTRY'] ?? '<NEXUS_PLACEHOLDER>',
  };
  const overrides: Record<string, string> = answers.usePresets ? {} : createInlineConfigs();

  for (const file of listFilesRecursive(TEMPLATE_DIR)) {
    // Dotfiles are stored as `_name`: npm drops .gitignore/.npmrc from tarballs, and linters would pick up live
    // .oxlintrc.json/.fallowrc.json from node_modules/@portal-poc/cli/templates of every app that installs the CLI.
    const relativePath = relative(TEMPLATE_DIR, file).replace(/(^|\/)_(gitignore|npmrc|oxlintrc\.json|fallowrc\.json)$/, '$1.$2');
    let content = overrides[relativePath] ?? readFileSync(file, 'utf8');
    if (relativePath === 'src/app/exposes/RemoteBridge.tsx' && !answers.withBridge) {
      content = BRIDGE_STUB;
    }
    if (relativePath === 'package.json' && !answers.withBridge) {
      content = dropBridge(content);
    }
    writeFile(join(targetDir, relativePath), replaceTokens(content, tokens));
  }

  for (const layer of answers.layers) {
    writeFile(join(targetDir, 'src', layer, 'README.md'), `# ${layer}\n\n${LAYER_DESCRIPTIONS[layer]}\n`);
  }

  console.log(`\n✔ Created remote "${name}" in ${targetDir}`);
  console.log(`  layers: app, pages, shared${answers.layers.length > 0 ? `, ${answers.layers.join(', ')}` : ''}`);
  console.log(`  configs: ${answers.usePresets ? 'inherited from @portal-poc/presets' : 'inlined'}; bridge entry: ${answers.withBridge ? 'yes' : 'stub'}`);
  console.log('\nNext: pnpm install && pnpm dev   (then register the remote in the host config.json)');
};
