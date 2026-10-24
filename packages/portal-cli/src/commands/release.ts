import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describeConflict, findSingletonConflicts } from '@portal/mf-shared';
import { readHostCompat, readJsonSource } from '../lib/host-compat.ts';
import { toManifest } from '../lib/manifest.ts';
import { readEntry, readStand, writeEntry } from '../lib/registry.ts';
import { parseList } from '../lib/text.ts';
import { verifyRemote } from './verify-remote.ts';
import type { VerifyMode } from './verify-remote.ts';

const readPackageVersion = (appDir: string): string => {
  const pkg: { version?: string } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  if (!pkg.version) {
    throw new Error('package.json has no version');
  }
  return pkg.version;
};

const readRemoteName = (appDir: string): string =>
  toManifest(JSON.parse(readFileSync(join(appDir, 'dist', 'mf-manifest.json'), 'utf8'))).name;

type PublishOptions = { dir?: string; nexusDir: string; version?: string };

/**
 * Uploads the build as an IMMUTABLE artifact: `<nexus>/<name>/<version>/` (+ `bridge/` for the isolated variant).
 * Re-publishing a version is refused: versions are never overwritten (no cache poisoning, open tabs keep working).
 */
export const runPublish = (options: PublishOptions): void => {
  const appDir = resolve(options.dir ?? '.');
  const name = readRemoteName(appDir);
  const version = options.version ?? readPackageVersion(appDir);
  const target = join(resolve(options.nexusDir), name, version);
  if (existsSync(target)) {
    throw new Error(`${name}@${version} is already published — artifacts are immutable, bump the version.`);
  }
  mkdirSync(target, { recursive: true });
  cpSync(join(appDir, 'dist'), target, { recursive: true });
  const bridgeDist = join(appDir, 'dist-bridge');
  if (existsSync(bridgeDist)) {
    cpSync(bridgeDist, join(target, 'bridge'), { recursive: true });
  }
  console.log(`✔ Published ${name}@${version} → ${target}${existsSync(bridgeDist) ? ' (+ bridge variant)' : ''}`);
};

type ReleaseOptions = {
  dir?: string;
  stand: string;
  registry: string;
  version?: string;
  mode?: VerifyMode;
  basePath?: string;
  scopes?: string;
};

const hasBridgeVariant = async (url: string): Promise<boolean> => {
  try {
    await readJsonSource(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Points a stand at a published version, behind the compatibility gate: the published manifest is verified against the
 * compat.json of the host CURRENTLY deployed on that stand. Writes `registry/<stand>/<name>.json` — in CI this is the
 * PR; `--version <older>` is a rollback through the same gate.
 */
export const runRelease = async (options: ReleaseOptions): Promise<void> => {
  const appDir = resolve(options.dir ?? '.');
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  if (!stand.nexusUrl) {
    throw new Error(`Stand "${options.stand}" has no nexusUrl: it runs dev servers, nothing to release.`);
  }
  const name = readRemoteName(appDir);
  const version = options.version ?? readPackageVersion(appDir);
  const mode = options.mode ?? 'integrated';
  const manifestUrl = `${stand.nexusUrl}/${name}/${version}/mf-manifest.json`;
  const bridgeManifestUrl = `${stand.nexusUrl}/${name}/${version}/bridge/mf-manifest.json`;

  const manifest = toManifest(await readJsonSource(manifestUrl), manifestUrl);
  const hostCompat = await readHostCompat(`${stand.url}/compat.json`);
  const withBridge = mode === 'integrated' && (await hasBridgeVariant(bridgeManifestUrl));

  const structural = verifyRemote({ manifest, mode, checkRanges: false }).errors;
  const conflicts = mode === 'integrated' ? findSingletonConflicts(manifest.shared, hostCompat.singletons) : [];

  console.log(`portal-cli release — ${name}@${version} → ${options.stand} (host ${hostCompat.hostVersion})`);
  for (const error of structural) {
    console.log(`  ✗ ${error}`);
  }
  for (const conflict of conflicts) {
    console.log(`  ${withBridge ? '⚠' : '✗'} ${describeConflict(conflict)}`);
  }
  if (structural.length > 0 || (conflicts.length > 0 && !withBridge)) {
    console.log(`\n✗ Release blocked: ${name}@${version} is not compatible with the host on "${options.stand}". Registry unchanged.`);
    process.exitCode = 1;
    return;
  }
  if (conflicts.length > 0) {
    console.log('  ⚠ The host will run this version ISOLATED (bridge variant): no shared transitions/context.');
  }

  const previous = readEntry(registryDir, options.stand, name);
  const basePath = options.basePath ?? previous?.basePath;
  const scopes = options.scopes ? parseList(options.scopes) : previous?.scopes;
  if (!basePath || !scopes) {
    throw new Error(`First release of "${name}" on "${options.stand}": pass --base-path and --scopes (host team approval).`);
  }
  const path = writeEntry(registryDir, options.stand, name, {
    version,
    manifest: manifestUrl,
    ...(withBridge ? { bridgeManifest: bridgeManifestUrl } : {}),
    basePath,
    scopes,
  });
  console.log(`\n✔ ${options.stand}: ${name} ${previous?.version ?? '(new)'} → ${version}`);
  console.log(`  Updated ${path} — in CI this change is opened as a PR to the registry; merge deploys the stand config.`);
};
