import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SINGLETONS } from '@portal-poc/mf-shared';
import { isValidTrackedBranch } from '../lib/branches.ts';
import { gateEntry } from '../lib/gate.ts';
import { readHostCompat, readJsonSource } from '../lib/host-compat.ts';
import { toManifest } from '../lib/manifest.ts';
import { uploadDir, uploadFile } from '../lib/nexus.ts';
import {
  readEntries,
  readStand,
  readStandNames,
  releaseUrl,
  SNAPSHOT_VERSION,
  snapshotUrl,
  standFilesUrl,
} from '../lib/registry.ts';

type RegistryOptions = { stand: string; registry: string };

/**
 * Host deploy gate (reverse direction): a new host must not break remotes already registered on the stand.
 * Returns the number of remotes it would break.
 */
const checkRegistry = async (options: RegistryOptions & { against?: string }): Promise<number> => {
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  const hostCompat = await readHostCompat(options.against ?? `${stand.url}/compat.json`);
  let failed = 0;
  console.log(`portal-cli registry check — stand "${options.stand}" against host ${hostCompat.hostVersion}`);
  for (const [name, entry] of Object.entries(readEntries(registryDir, options.stand))) {
    const gate = await gateEntry(entry, hostCompat);
    if (gate.status === 'ok') {
      console.log(`  ✔ ${name}@${entry.version}`);
    } else if (gate.status === 'isolated') {
      console.log(`  ⚠ ${name}@${entry.version} will run isolated: ${gate.detail}`);
    } else {
      failed += 1;
      console.log(`  ✗ ${name}@${entry.version}: ${gate.detail}`);
    }
  }
  if (failed > 0) {
    console.log(`\n✗ This host would break ${failed} remote(s) on "${options.stand}".`);
  }
  return failed;
};

export const runRegistryCheck = async (options: RegistryOptions & { against?: string }): Promise<void> => {
  if ((await checkRegistry(options)) > 0) {
    process.exitCode = 1;
  }
};

/**
 * Host deploy job: the build passes the reverse gate against the remotes registered on the stand, then becomes the
 * stand's host (`portal-stands/<stand>/host/`, compat.json and index.html last). A refused host leaves the stand as is.
 */
export const runHostDeploy = async (options: RegistryOptions & { dist: string }): Promise<void> => {
  const stand = readStand(resolve(options.registry), options.stand);
  const dist = resolve(options.dist);
  const compat = join(dist, 'compat.json');
  if (!existsSync(compat)) {
    throw new Error(`${compat} not found — build the host first.`);
  }
  if ((await checkRegistry({ ...options, against: compat })) > 0) {
    console.log('✗ Host not deployed: the stand keeps its current host.');
    process.exitCode = 1;
    return;
  }
  await uploadDir(dist, `${standFilesUrl(stand.nexusUrl, options.stand)}/host`, ['compat.json', 'index.html']);
  console.log(`✔ Host deployed to "${options.stand}": ${stand.url}`);
};

/**
 * Config deploy job: aggregates `registry/<stand>/*.json` into the stand's `/config.json` read by the host at startup —
 * written to a file (`--out`) and/or uploaded as the stand's config (`--upload`, `portal-stands/<stand>/config.json`).
 */
export const runRegistryBuild = async (options: RegistryOptions & { out?: string; upload?: boolean }): Promise<void> => {
  if (!options.out && !options.upload) {
    throw new Error('Nothing to do: pass --out <file> and/or --upload.');
  }
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  const config = { env: options.stand, remotes: readEntries(registryDir, options.stand) };
  const json = `${JSON.stringify(config, null, 2)}\n`;
  const count = `${Object.keys(config.remotes).length} remote(s)`;
  if (options.out) {
    const out = resolve(options.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json);
    console.log(`✔ ${options.stand} config: ${count} → ${out}`);
  }
  if (options.upload) {
    await uploadFile(`${standFilesUrl(stand.nexusUrl, options.stand)}/config.json`, json);
    console.log(`✔ ${options.stand} config: ${count} → ${stand.url}/config.json`);
  }
};

const builtVersionOf = (manifest: unknown): string => {
  const metaData = (manifest as { metaData?: { portal?: { appVersion?: unknown } } } | null)?.metaData;
  return String(metaData?.portal?.appVersion ?? '?');
};

const requiredOf = (shared: ReadonlyArray<{ name: string; requiredVersion?: string }>, name: string) =>
  shared.find((entry) => entry.name === name)?.requiredVersion ?? '—';

/** Who runs which version where — built from the registry and the published manifests. */
export const runRegistryStatus = async (options: { registry: string; stands?: string }): Promise<void> => {
  const registryDir = resolve(options.registry);
  const stands = options.stands ? options.stands.split(',') : readStandNames(registryDir);
  const rows: string[][] = [['stand', 'remote', 'version', 'react', 'react-router', '@portal-poc/ds', 'bridge build']];
  for (const stand of stands) {
    for (const [name, entry] of Object.entries(readEntries(registryDir, stand))) {
      const published = await readJsonSource(entry.manifest).catch(() => null);
      const shared = published === null ? null : toManifest(published, entry.manifest).shared;
      rows.push([
        stand,
        name,
        entry.version === SNAPSHOT_VERSION ? `snapshot ${builtVersionOf(published)}` : entry.version,
        shared ? requiredOf(shared, 'react') : 'unreachable',
        shared ? requiredOf(shared, 'react-router') : '',
        shared ? requiredOf(shared, '@portal-poc/ds') : '',
        entry.bridgeManifest ? 'yes' : 'no',
      ]);
    }
  }
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? [];
  for (const row of rows) {
    console.log(row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  '));
  }
  console.log(`\nHost singletons supported by this platform version: ${Object.keys(SINGLETONS).join(', ')}`);
};

/** Offline validation for the registry repository's CI: every stand folder is defined, every entry is well-formed. */
export const runRegistryValidate = (options: { registry: string }): void => {
  const registryDir = resolve(options.registry);
  const problems: string[] = [];
  let entries = 0;
  const standNames = readStandNames(registryDir);
  for (const stand of standNames) {
    const definition = readStand(registryDir, stand);
    if ([definition.snapshot, definition.branch, definition.promoteFrom].filter(Boolean).length !== 1) {
      problems.push(`stands.json ${stand}: set exactly one of "snapshot", "branch" or "promoteFrom"`);
    }
    if (definition.branch && !isValidTrackedBranch(definition.branch)) {
      problems.push(`stands.json ${stand}: branch "${definition.branch}" must be latest-release or release/X.Y`);
    }
    if (definition.promoteFrom && (definition.promoteFrom === stand || !standNames.includes(definition.promoteFrom))) {
      problems.push(`stands.json ${stand}: promoteFrom "${definition.promoteFrom}" is not another stand`);
    } else if (definition.promoteFrom && readStand(registryDir, definition.promoteFrom).snapshot) {
      problems.push(`stands.json ${stand}: promoteFrom "${definition.promoteFrom}" is a snapshot stand (nothing immutable to promote)`);
    }
    for (const [name, entry] of Object.entries(readEntries(registryDir, stand))) {
      entries += 1;
      const where = `${stand}/${name}.json`;
      const expected = definition.snapshot
        ? snapshotUrl(definition.nexusUrl, stand, name)
        : releaseUrl(definition.nexusUrl, name, entry.version);
      if (definition.snapshot ? entry.version !== SNAPSHOT_VERSION : !/^\d+\.\d+\.\d+/.test(entry.version)) {
        problems.push(`${where}: version "${entry.version}" must be ${definition.snapshot ? `"${SNAPSHOT_VERSION}"` : 'semver'}`);
      }
      if (!entry.manifest.startsWith(`${expected}/`)) {
        problems.push(`${where}: manifest must point into ${expected}/ (${definition.snapshot ? 'the stand snapshot' : 'immutable artifact'})`);
      }
      if (!entry.basePath.startsWith('/') || entry.scopes.length === 0) {
        problems.push(`${where}: basePath and scopes are required`);
      }
    }
  }
  for (const problem of problems) {
    console.log(`  ✗ ${problem}`);
  }
  console.log(problems.length === 0 ? `✔ Registry valid (${entries} entries)` : `\n✗ ${problems.length} problem(s)`);
  if (problems.length > 0) {
    process.exitCode = 1;
  }
};
