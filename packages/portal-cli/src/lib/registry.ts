import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type RegistryEntry = {
  /** Published version, or `snapshot` on a snapshot stand (the build is identified by its manifest). */
  version: string;
  manifest: string;
  /** Isolated (no shared deps) build, used by the host when the main build is incompatible with its singletons. */
  bridgeManifest?: string;
  basePath: string;
  scopes: string[];
  /** Navigation label in the host (host team owns it, like basePath). */
  title?: string;
};

/**
 * What a stand runs — exactly one of:
 * - `snapshot: true`: whatever was deployed last, from any branch, overwritten in place (dev3);
 * - `branch`: immutable release builds of one line — `release/X.Y` (pinned, e.g. the pilot) or `latest-release`
 *   (the newest release/*); `portal-cli deploy` refuses builds of another line;
 * - `promoteFrom`: never deployed to, versions arrive only via `portal-cli promote` from that stand (tst).
 * `nexusUrl` is the Nexus `/repository` base: releases live in portal-releases, snapshots in portal-snapshots.
 */
export type StandDefinition = { url: string; nexusUrl: string; snapshot?: boolean; branch?: string; promoteFrom?: string };

export const LATEST_RELEASE = 'latest-release';
export const SNAPSHOT_VERSION = 'snapshot';

/**
 * Raw repositories: releases refuse redeploy (immutable versions), snapshots allow it (one folder per stand), stands
 * hold what each stand's web server serves (the host build and `/config.json`, both overwritten on deploy).
 */
const RELEASES_REPO = 'portal-releases';
const SNAPSHOTS_REPO = 'portal-snapshots';
const STANDS_REPO = 'portal-stands';

export const releaseUrl = (nexusUrl: string, name: string, version: string): string => `${nexusUrl}/${RELEASES_REPO}/${name}/${version}`;
export const snapshotUrl = (nexusUrl: string, stand: string, name: string): string => `${nexusUrl}/${SNAPSHOTS_REPO}/${stand}/${name}`;
export const standFilesUrl = (nexusUrl: string, stand: string): string => `${nexusUrl}/${STANDS_REPO}/${stand}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const readStand = (registryDir: string, stand: string): StandDefinition => {
  const stands: unknown = JSON.parse(readFileSync(join(registryDir, 'stands.json'), 'utf8'));
  const definition = isRecord(stands) ? stands[stand] : undefined;
  if (!isRecord(definition) || typeof definition['url'] !== 'string' || typeof definition['nexusUrl'] !== 'string') {
    throw new Error(`Unknown stand "${stand}" (or no url/nexusUrl) in ${join(registryDir, 'stands.json')}`);
  }
  return {
    url: definition['url'],
    nexusUrl: definition['nexusUrl'],
    ...(definition['snapshot'] === true ? { snapshot: true } : {}),
    ...(typeof definition['branch'] === 'string' ? { branch: definition['branch'] } : {}),
    ...(typeof definition['promoteFrom'] === 'string' ? { promoteFrom: definition['promoteFrom'] } : {}),
  };
};

/** Changes one stand's branch in stands.json, keeping everything else as is. Returns the file path. */
export const writeStandBranch = (registryDir: string, stand: string, branch: string): string => {
  const path = join(registryDir, 'stands.json');
  const stands: Record<string, Record<string, unknown>> = JSON.parse(readFileSync(path, 'utf8'));
  const definition = stands[stand];
  if (!definition) {
    throw new Error(`Unknown stand "${stand}" in ${path}`);
  }
  definition['branch'] = branch;
  writeFileSync(path, `${JSON.stringify(stands, null, 2)}\n`);
  return path;
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

const serialize = (entry: RegistryEntry) => `${JSON.stringify(entry, null, 2)}\n`;

/** Writes the entry; null when the file already holds exactly this entry (nothing to commit). */
export const writeEntry = (registryDir: string, stand: string, name: string, entry: RegistryEntry): string | null => {
  const path = entryPath(registryDir, stand, name);
  if (existsSync(path) && readFileSync(path, 'utf8') === serialize(entry)) {
    return null;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialize(entry));
  return path;
};
