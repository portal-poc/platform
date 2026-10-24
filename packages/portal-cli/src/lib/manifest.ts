import type { RemoteManifest } from '../commands/verify-remote.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const toManifest = (value: unknown, source = 'mf-manifest.json'): RemoteManifest => {
  if (!isRecord(value) || typeof value['name'] !== 'string' || !Array.isArray(value['exposes']) || !Array.isArray(value['shared'])) {
    throw new Error(`${source} has an unexpected shape.`);
  }
  const metaData = isRecord(value['metaData']) ? value['metaData'] : {};
  return {
    name: value['name'],
    ...(typeof metaData['pluginVersion'] === 'string' ? { pluginVersion: metaData['pluginVersion'] } : {}),
    exposes: value['exposes'].filter(isRecord).map((expose) => ({ path: String(expose['path']) })),
    shared: value['shared'].filter(isRecord).map((entry) => ({
      name: String(entry['name']),
      ...(typeof entry['singleton'] === 'boolean' ? { singleton: entry['singleton'] } : {}),
      ...(typeof entry['requiredVersion'] === 'string' ? { requiredVersion: entry['requiredVersion'] } : {}),
    })),
  };
};
