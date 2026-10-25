import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertCheckedOut, assertLineAccepted, currentRef, headSha, lineTags, releaseVersionOf, snapshotVersionOf } from '../lib/branches.ts';
import { readJsonSource } from '../lib/host-compat.ts';
import { copyFolder, isPublished, pruneStaleQuietly, uploadDir } from '../lib/nexus.ts';
import { HOST_NAME, readHostEntry, readStand, releaseUrl, SNAPSHOT_VERSION, standFilesUrl, writeHostEntry } from '../lib/registry.ts';
import type { HostEntry } from '../lib/registry.ts';
import { saveRegistryChange } from '../lib/registry-change.ts';
import type { ChangeMode } from '../lib/registry-change.ts';
import { checkRegistry } from './registry.ts';
import { assertReleaseStand } from './release.ts';

/** compat.json and index.html last: until they are there, the stand keeps serving its previous complete host. */
const HOST_LAST = ['compat.json', 'index.html'];

type HostCompatInfo = { hostVersion?: unknown; commit?: unknown };

const readCompatInfo = async (url: string): Promise<HostCompatInfo> => ((await readJsonSource(url)) ?? {}) as HostCompatInfo;

const hostEntryOf = (compat: HostCompatInfo, version: string): HostEntry => ({
  version,
  ...(typeof compat.commit === 'string' ? { commit: compat.commit } : {}),
});

const buildHost = (hostDir: string, version: string): string => {
  execSync('pnpm build', { cwd: hostDir, stdio: 'inherit', env: { ...process.env, PORTAL_APP_VERSION: version } });
  const compat = join(hostDir, 'dist', 'compat.json');
  const built: HostCompatInfo = JSON.parse(readFileSync(compat, 'utf8'));
  if (built.hostVersion !== version) {
    throw new Error(`The host was built as ${String(built.hostVersion)}, not ${version}: its vite.config must read PORTAL_APP_VERSION.`);
  }
  return compat;
};

/** Overwrites the stand's host with the files of `dist` (snapshot stand) and removes files of earlier builds. */
const installFromDist = async (nexusUrl: string, stand: string, dist: string): Promise<void> => {
  const hostUrl = `${standFilesUrl(nexusUrl, stand)}/host`;
  const files = await uploadDir(dist, hostUrl, HOST_LAST);
  await pruneStaleQuietly(hostUrl, files);
};

type HostDeployOptions = ChangeMode & {
  stand: string;
  registry: string;
  /** Host repository root (default: "."). */
  dir?: string;
  ref?: string;
  run?: string;
};

/**
 * The host's "Deploy" button, under the same stand rules as remotes (registry stands.json):
 * - snapshot stand (dev3): any branch → built as `<version>-snapshot.<run>+<sha>`, gated, overwrites the stand's host;
 * - release stand (dev2, dev1): `release/X.Y` → next rc, `vX.Y.Z` → that version, of the stand's line only; published
 *   once to `portal-releases/host/<version>/`, gated against the stand's remotes, then `<stand>/_host.json` is the
 *   release — the config deploy installs it (`host sync`);
 * - promoted stand (tst): refused — it gets the host of its source stand through Promote.
 * Every refusal happens before the build; a host that would break a registered remote never reaches the stand.
 */
export const runHostDeploy = async (options: HostDeployOptions): Promise<void> => {
  const hostDir = resolve(options.dir ?? '.');
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  const ref = options.ref ?? currentRef(hostDir);
  const run = options.run ?? process.env['GITHUB_RUN_NUMBER'] ?? String(Math.floor(Date.now() / 1000));

  if (stand.snapshot) {
    assertCheckedOut(hostDir, ref);
    const pkg: { version: string } = JSON.parse(readFileSync(join(hostDir, 'package.json'), 'utf8'));
    const version = snapshotVersionOf(pkg.version, run, headSha(hostDir));
    console.log(`portal-cli host deploy — ${ref} → ${options.stand} as ${version} (snapshot: overwritten in place)\n`);
    const compat = buildHost(hostDir, version);
    if ((await checkRegistry({ stand: options.stand, registry: registryDir, against: compat })) > 0) {
      console.log('✗ Host not deployed: the stand keeps its current host.');
      process.exitCode = 1;
      return;
    }
    await installFromDist(stand.nexusUrl, options.stand, join(hostDir, 'dist'));
    console.log(`✔ ${options.stand}: host ← ${version} (${stand.url}) — users get it on reload.`);
    const path = writeHostEntry(registryDir, options.stand, { version: SNAPSHOT_VERSION });
    if (path) {
      saveRegistryChange(registryDir, [path], `${options.stand}: host snapshot entry`, options);
    }
    return;
  }

  assertReleaseStand(options.stand, stand);
  const version = releaseVersionOf(ref, lineTags(hostDir, ref), run);
  assertLineAccepted(options.stand, stand, version, hostDir);
  assertCheckedOut(hostDir, ref);
  const target = releaseUrl(stand.nexusUrl, HOST_NAME, version);
  console.log(`portal-cli host deploy — ${ref} → ${options.stand} as ${version} (immutable release)\n`);
  if (await isPublished(`${target}/compat.json`)) {
    console.log(`✔ host@${version} is already published: deploying that artifact (versions are never rebuilt).`);
  } else {
    buildHost(hostDir, version);
    await uploadDir(join(hostDir, 'dist'), target, HOST_LAST);
    console.log(`✔ Published host@${version} → ${target}/`);
  }
  await releaseHost({ ...options, registry: registryDir, version });
};

type HostReleaseOptions = ChangeMode & { stand: string; registry: string; version: string; dir?: string };

/** Gate + registry entry for a PUBLISHED host version: the release itself, and rollback (`host release --version`). */
const releaseHost = async (options: HostReleaseOptions): Promise<void> => {
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  const compatUrl = `${releaseUrl(stand.nexusUrl, HOST_NAME, options.version)}/compat.json`;
  if ((await checkRegistry({ stand: options.stand, registry: registryDir, against: compatUrl })) > 0) {
    console.log(`✗ Host ${options.version} not released: the stand keeps its current host. Registry unchanged.`);
    process.exitCode = 1;
    return;
  }
  const previous = readHostEntry(registryDir, options.stand);
  const path = writeHostEntry(registryDir, options.stand, hostEntryOf(await readCompatInfo(compatUrl), options.version));
  if (!path) {
    console.log(`\n✔ ${options.stand} already runs host ${options.version}.`);
    return;
  }
  console.log(`\n✔ ${options.stand}: host ${previous?.version ?? '(unversioned)'} → ${options.version}`);
  saveRegistryChange(registryDir, [path], `${options.stand}: host@${options.version}`, options);
};

/** Points a release stand at a published host version (rollback: an older one), through the reverse gate. */
export const runHostRelease = async (options: HostReleaseOptions): Promise<void> => {
  const stand = readStand(resolve(options.registry), options.stand);
  assertReleaseStand(options.stand, stand);
  assertLineAccepted(options.stand, stand, options.version, resolve(options.dir ?? '.'));
  await releaseHost(options);
};

/**
 * Config deploy step: makes the stand serve the host its registry entry names. A release version is copied from
 * `portal-releases/host/<version>/` onto `portal-stands/<stand>/host/` when the stand serves another one; the
 * snapshot stand and stands without an entry are left as they are.
 */
export const runHostSync = async (options: { stand: string; registry: string }): Promise<void> => {
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  const entry = readHostEntry(registryDir, options.stand);
  if (!entry || entry.version === SNAPSHOT_VERSION) {
    console.log(`· ${options.stand}: host ${entry ? 'is a snapshot (deployed in place)' : 'not versioned in the registry'} — nothing to sync.`);
    return;
  }
  const served = await readCompatInfo(`${stand.url}/compat.json`).catch(() => ({}) as HostCompatInfo);
  if (served.hostVersion === entry.version) {
    console.log(`· ${options.stand}: host ${entry.version} (unchanged)`);
    return;
  }
  const hostUrl = `${standFilesUrl(stand.nexusUrl, options.stand)}/host`;
  const files = await copyFolder(releaseUrl(stand.nexusUrl, HOST_NAME, entry.version), hostUrl, HOST_LAST);
  await pruneStaleQuietly(hostUrl, files);
  console.log(`✔ ${options.stand}: host ${String(served.hostVersion ?? '(none)')} → ${entry.version} (${stand.url})`);
};
