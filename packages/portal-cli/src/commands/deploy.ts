import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertCheckedOut, assertLineAccepted, currentRef, headSha, lineTags, releaseVersionOf, snapshotVersionOf } from '../lib/branches.ts';
import { readHostCompat } from '../lib/host-compat.ts';
import { toManifest } from '../lib/manifest.ts';
import { uploadDir } from '../lib/nexus.ts';
import { readEntry, readStand, SNAPSHOT_VERSION, snapshotUrl, writeEntry } from '../lib/registry.ts';
import { saveRegistryChange } from '../lib/registry-change.ts';
import { assertBuiltAs, assertReleaseStand, gateBuild, placementOf, runPublish, runRelease } from './release.ts';
import type { ReleaseOptions } from './release.ts';

type DeployOptions = Omit<ReleaseOptions, 'version'> & {
  /** Branch or tag to deploy (default: what is checked out). CI checks the ref out and passes it. */
  ref?: string;
  /** Build number for rc/snapshot versions (default: GITHUB_RUN_NUMBER, else a timestamp). */
  run?: string;
};

const build = (appDir: string, version: string) => {
  const env = { ...process.env, PORTAL_APP_VERSION: version };
  execSync('pnpm build', { cwd: appDir, stdio: 'inherit', env });
  execSync('pnpm run --if-present verify', { cwd: appDir, stdio: 'inherit', env });
};

/**
 * Snapshot stand: the gate runs BEFORE the upload (the upload is live at once), then the build overwrites the stand's
 * folder in portal-snapshots. The registry entry is constant; it is written only on the first deploy or when the
 * bridge variant appears/disappears.
 */
const deploySnapshot = async (appDir: string, registryDir: string, options: DeployOptions, version: string) => {
  const stand = readStand(registryDir, options.stand);
  const manifest = toManifest(JSON.parse(readFileSync(join(appDir, 'dist', 'mf-manifest.json'), 'utf8')));
  const name = manifest.name;
  const mode = options.mode ?? 'integrated';
  const bridgeDist = join(appDir, 'dist-bridge');
  const withBridge = mode === 'integrated' && existsSync(bridgeDist);
  const hostCompat = await readHostCompat(`${stand.url}/compat.json`);
  if (!gateBuild(`${name}@${version} → ${options.stand}`, manifest, hostCompat, mode, withBridge)) {
    console.log(`\n✗ Deploy blocked: not compatible with the host on "${options.stand}". The stand keeps its current build.`);
    process.exitCode = 1;
    return;
  }

  const base = snapshotUrl(stand.nexusUrl, options.stand, name);
  if (withBridge) {
    await uploadDir(bridgeDist, `${base}/bridge`);
  }
  await uploadDir(join(appDir, 'dist'), base);
  console.log(`\n✔ ${options.stand}: ${name} ← ${version} (${base}/) — users get it on reload.`);

  const previous = readEntry(registryDir, options.stand, name);
  const path = writeEntry(registryDir, options.stand, name, {
    version: SNAPSHOT_VERSION,
    manifest: `${base}/mf-manifest.json`,
    ...(withBridge ? { bridgeManifest: `${base}/bridge/mf-manifest.json` } : {}),
    ...placementOf(previous, options, name, options.stand),
  });
  if (path) {
    saveRegistryChange(registryDir, [path], `${options.stand}: ${name} snapshot entry`, options);
  } else {
    console.log('  Registry unchanged: the entry already points at the snapshot.');
  }
};

/**
 * The pipeline's "Deploy" button, the same locally: a ref + a stand → checks → build → publish → registry.
 * - snapshot stand (dev3): any branch, overwritten in place;
 * - release stand (dev2, dev1): release/X.Y (→ next rc) or vX.Y.Z (→ that version, built and published once),
 *   only of the stand's line; the registry change is the release;
 * - promoted stand (tst): refused, it takes versions only from its source stand.
 * Every refusal happens before the build.
 */
export const runDeploy = async (options: DeployOptions): Promise<void> => {
  const appDir = resolve(options.dir ?? '.');
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  const ref = options.ref ?? currentRef(appDir);
  const run = options.run ?? process.env['GITHUB_RUN_NUMBER'] ?? String(Math.floor(Date.now() / 1000));

  if (stand.snapshot) {
    assertCheckedOut(appDir, ref);
    const pkg: { version: string } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
    const version = snapshotVersionOf(pkg.version, run, headSha(appDir));
    console.log(`portal-cli deploy — ${ref} → ${options.stand} as ${version} (snapshot: overwritten in place)\n`);
    build(appDir, version);
    assertBuiltAs(appDir, version);
    await deploySnapshot(appDir, registryDir, options, version);
    return;
  }

  assertReleaseStand(options.stand, stand);
  const version = releaseVersionOf(ref, lineTags(appDir, ref), run);
  assertLineAccepted(options.stand, stand, version, appDir);
  assertCheckedOut(appDir, ref);
  console.log(`portal-cli deploy — ${ref} → ${options.stand} as ${version} (immutable release)\n`);
  build(appDir, version);
  await runPublish({ dir: appDir, nexusUrl: stand.nexusUrl, version, reuse: true });
  await runRelease({ ...options, dir: appDir, version });
};
