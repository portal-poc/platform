import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type RegistryEntry = {
  version: string;
  manifest: string;
  /** Isolated (no shared deps) build, used by the host when the main build is incompatible with its singletons. */
  bridgeManifest?: string;
  basePath: string;
  scopes: string[];
  /** Served by a Vite dev server (local stand): the host attaches to its HMR. */
  devServer?: boolean;
  /** Navigation label in the host (host team owns it, like basePath). */
  title?: string;
};

export type StandDefinition = { url: string; nexusUrl?: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const readStand = (registryDir: string, stand: string): StandDefinition => {
  const stands: unknown = JSON.parse(readFileSync(join(registryDir, 'stands.json'), 'utf8'));
  const definition = isRecord(stands) ? stands[stand] : undefined;
  if (!isRecord(definition) || typeof definition['url'] !== 'string') {
    throw new Error(`Unknown stand "${stand}" in ${join(registryDir, 'stands.json')}`);
  }
  return {
    url: definition['url'],
    ...(typeof definition['nexusUrl'] === 'string' ? { nexusUrl: definition['nexusUrl'] } : {}),
  };
};

export const readStandNames = (registryDir: string): string[] => {
  const stands: unknown = JSON.parse(readFileSync(join(registryDir, 'stands.json'), 'utf8'));
  return isRecord(stands) ? Object.keys(stands) : [];
};

const entryPath = (registryDir: string, stand: string, name: string) => join(registryDir, stand, `${name}.json`);

const toEntry = (value: unknown, source: string): RegistryEntry => {
  if (!isRecord(value) || typeof value['version'] !== 'string' || typeof value['manifest'] !== 'string') {
    throw new Error(`${source} is not a registry entry`);
  }
  return {
    version: value['version'],
    manifest: value['manifest'],
    ...(typeof value['bridgeManifest'] === 'string' ? { bridgeManifest: value['bridgeManifest'] } : {}),
    basePath: String(value['basePath'] ?? ''),
    scopes: Array.isArray(value['scopes']) ? value['scopes'].map(String) : [],
    ...(value['devServer'] === true ? { devServer: true } : {}),
    ...(typeof value['title'] === 'string' ? { title: value['title'] } : {}),
  };
};

export const readEntry = (registryDir: string, stand: string, name: string): RegistryEntry | null => {
  const path = entryPath(registryDir, stand, name);
  return existsSync(path) ? toEntry(JSON.parse(readFileSync(path, 'utf8')), path) : null;
};

export const readEntries = (registryDir: string, stand: string): Record<string, RegistryEntry> => {
  const dir = join(registryDir, stand);
  if (!existsSync(dir)) {
    return {};
  }
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const name = file.replace(/\.json$/, '');
        return [name, toEntry(JSON.parse(readFileSync(join(dir, file), 'utf8')), join(dir, file))];
      }),
  );
};

export const writeEntry = (registryDir: string, stand: string, name: string, entry: RegistryEntry): string => {
  const path = entryPath(registryDir, stand, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`);
  return path;
};
