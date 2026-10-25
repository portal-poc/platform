import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describeConflict, findSingletonConflicts } from '@portal-poc/mf-shared';
import type { HostCompat } from '@portal-poc/mf-shared';
import { assertLineAccepted } from '../lib/branches.ts';
import { readHostCompat, readJsonSource } from '../lib/host-compat.ts';
import { toManifest } from '../lib/manifest.ts';
import { isPublished, uploadDir } from '../lib/nexus.ts';
import { readEntry, readStand, releaseUrl, writeEntry } from '../lib/registry.ts';
import type { RegistryEntry, StandDefinition } from '../lib/registry.ts';
import { saveRegistryChange } from '../lib/registry-change.ts';
import type { ChangeMode } from '../lib/registry-change.ts';
import { parseList } from '../lib/text.ts';
import { verifyRemote } from './verify-remote.ts';
import type { RemoteManifest, VerifyMode } from './verify-remote.ts';

/** `PORTAL_APP_VERSION` (set by the deploy for build, publish and release alike) or the package.json version. */
export const readAppVersion = (appDir: string): string => {
  const pkg: { version?: string } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  const version = process.env['PORTAL_APP_VERSION'] || pkg.version;
  if (!version) {
    throw new Error('No version: set PORTAL_APP_VERSION or package.json version');
  }
  return version;
};

const readBuiltManifest = (appDir: string): unknown => JSON.parse(readFileSync(join(appDir, 'dist', 'mf-manifest.json'), 'utf8'));

export const readRemoteName = (appDir: string): string => toManifest(readBuiltManifest(appDir)).name;

const readBuiltVersion = (appDir: string): unknown => {
  const manifest = readBuiltManifest(appDir) as { metaData?: { portal?: { appVersion?: unknown } } };
  return manifest.metaData?.portal?.appVersion;
};

export const assertBuiltAs = (appDir: string, version: string): void => {
  const builtAs = readBuiltVersion(appDir);
  if (builtAs !== version) {
    throw new Error(`dist was built as ${String(builtAs)}, not ${version}: build with PORTAL_APP_VERSION=${version}.`);
  }
};

type PublishOptions = { dir?: string; nexusUrl: string; version?: string; reuse?: boolean };

/**
 * Uploads the build as an IMMUTABLE artifact to portal-releases: `<name>/<version>/` (+ `bridge/` for the isolated
 * variant). A version is never overwritten (no cache poisoning, open tabs keep working): re-publishing is refused,
 * or with `--reuse` (deploying a tag that is already published) the existing artifact is used as is.
 */
export const runPublish = async (options: PublishOptions): Promise<void> => {
  const appDir = resolve(options.dir ?? '.');
  const name = readRemoteName(appDir);
  const version = options.version ?? readAppVersion(appDir);
  const target = releaseUrl(options.nexusUrl, name, version);
  if (await isPublished(`${target}/mf-manifest.json`)) {
    if (options.reuse) {
      console.log(`✔ ${name}@${version} is already published: deploying that artifact (versions are never rebuilt).`);
      return;
    }
    throw new Error(`${name}@${version} is already published — artifacts are immutable, bump the version.`);
  }
  assertBuiltAs(appDir, version);
  const bridgeDist = join(appDir, 'dist-bridge');
  if (existsSync(bridgeDist)) {
    await uploadDir(bridgeDist, `${target}/bridge`);
  }
  await uploadDir(join(appDir, 'dist'), target);
  console.log(`✔ Published ${name}@${version} → ${target}/${existsSync(bridgeDist) ? ' (+ bridge variant)' : ''}`);
};

/**
 * Compatibility gate of a build against the host CURRENTLY deployed on the stand: structure + singletons. Conflicts are
 * acceptable only with a bridge variant (the host then runs it isolated). Prints the verdict; false = blocked.
 */
export const gateBuild = (
  label: string,
  manifest: RemoteManifest,
  hostCompat: HostCompat,
  mode: VerifyMode,
  withBridge: boolean,
): boolean => {
  const structural = verifyRemote({ manifest, mode, checkRanges: false, toolingRange: hostCompat.remoteTooling.mfPlugin }).errors;
  const conflicts = mode === 'integrated' ? findSingletonConflicts(manifest.shared, hostCompat.singletons) : [];
  console.log(`${label} (host ${hostCompat.hostVersion})`);
  for (const error of structural) {
    console.log(`  ✗ ${error}`);
  }
  for (const conflict of conflicts) {
    console.log(`  ${withBridge ? '⚠' : '✗'} ${describeConflict(conflict)}`);
  }
  if (structural.length > 0 || (conflicts.length > 0 && !withBridge)) {
    return false;
  }
  if (conflicts.length > 0) {
    console.log('  ⚠ The host will run this build ISOLATED (bridge variant): no shared transitions/context.');
  }
  return true;
};

type PlacementOptions = { basePath?: string; scopes?: string };

/** Route, scopes and title belong to the host team: kept from the previous entry, given explicitly only the first time. */
export const placementOf = (previous: RegistryEntry | null, options: PlacementOptions, name: string, stand: string) => {
  const basePath = options.basePath ?? previous?.basePath;
  const scopes = options.scopes ? parseList(options.scopes) : previous?.scopes;
  if (!basePath || !scopes) {
    throw new Error(`First deploy of "${name}" to "${stand}": pass --base-path and --scopes (host team approval).`);
  }
  return { basePath, scopes, ...(previous?.title ? { title: previous.title } : {}) };
};

/** Release stands take published versions only (tst: via promote). */
export const assertReleaseStand = (standName: string, stand: StandDefinition): void => {
  if (stand.promoteFrom) {
    throw new Error(`"${standName}" is never deployed to: its versions come from "${stand.promoteFrom}" (portal-cli promote --from ${stand.promoteFrom} --to ${standName}).`);
  }
  if (stand.snapshot) {
    throw new Error(`"${standName}" is a snapshot stand: portal-cli deploy --stand ${standName} rebuilds it from any branch.`);
  }
};

const hasBridgeVariant = async (url: string): Promise<boolean> => {
  try {
    await readJsonSource(url);
    return true;
  } catch {
    return false;
  }
};

export type ReleaseOptions = PlacementOptions &
  ChangeMode & {
    dir?: string;
    stand: string;
    registry: string;
    version?: string;
    mode?: VerifyMode;
  };

/**
 * Points a release stand at a PUBLISHED version through the gate: the version must belong to the stand's line and be
 * compatible with the stand's host. Writes `registry/<stand>/<name>.json`. `--version <older>` is a rollback without
 * rebuilding anything.
 */
export const runRelease = async (options: ReleaseOptions): Promise<void> => {
  const appDir = resolve(options.dir ?? '.');
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  assertReleaseStand(options.stand, stand);
  const name = readRemoteName(appDir);
  const version = options.version ?? readAppVersion(appDir);
  assertLineAccepted(options.stand, stand, version, appDir);
  const mode = options.mode ?? 'integrated';
  const base = releaseUrl(stand.nexusUrl, name, version);
  const manifestUrl = `${base}/mf-manifest.json`;
  const bridgeManifestUrl = `${base}/bridge/mf-manifest.json`;

  const manifest = toManifest(await readJsonSource(manifestUrl), manifestUrl);
  const hostCompat = await readHostCompat(`${stand.url}/compat.json`);
  const withBridge = mode === 'integrated' && (await hasBridgeVariant(bridgeManifestUrl));
  if (!gateBuild(`portal-cli release — ${name}@${version} → ${options.stand}`, manifest, hostCompat, mode, withBridge)) {
    console.log(`\n✗ Release blocked: ${name}@${version} is not compatible with the host on "${options.stand}". Registry unchanged.`);
    process.exitCode = 1;
    return;
  }

  const previous = readEntry(registryDir, options.stand, name);
  const path = writeEntry(registryDir, options.stand, name, {
    version,
    manifest: manifestUrl,
    ...(withBridge ? { bridgeManifest: bridgeManifestUrl } : {}),
    ...placementOf(previous, options, name, options.stand),
  });
  if (!path) {
    console.log(`\n✔ ${options.stand} already runs ${name}@${version}.`);
    return;
  }
  console.log(`\n✔ ${options.stand}: ${name} ${previous?.version ?? '(new)'} → ${version}`);
  saveRegistryChange(registryDir, [path], `${options.stand}: ${name}@${version}`, options);
};
