import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describeConflict, findSingletonConflicts, SINGLETONS } from '@portal-poc/mf-shared';
import { readHostCompat, readJsonSource } from '../lib/host-compat.ts';
import { toManifest } from '../lib/manifest.ts';
import { readEntries, readStand } from '../lib/registry.ts';

type RegistryOptions = { stand: string; registry: string };

/** Host deploy gate (reverse direction): a new host must not break remotes already registered on the stand. */
export const runRegistryCheck = async (options: RegistryOptions & { against?: string }): Promise<void> => {
  const registryDir = resolve(options.registry);
  const stand = readStand(registryDir, options.stand);
  const hostCompat = await readHostCompat(options.against ?? `${stand.url}/compat.json`);
  let failed = 0;
  console.log(`portal-cli registry check — stand "${options.stand}" against host ${hostCompat.hostVersion}`);
  for (const [name, entry] of Object.entries(readEntries(registryDir, options.stand))) {
    const manifest = toManifest(await readJsonSource(entry.manifest), entry.manifest);
    const conflicts = findSingletonConflicts(manifest.shared, hostCompat.singletons);
    if (conflicts.length === 0) {
      console.log(`  ✔ ${name}@${entry.version}`);
    } else if (entry.bridgeManifest) {
      console.log(`  ⚠ ${name}@${entry.version} will run isolated: ${conflicts.map(describeConflict).join('; ')}`);
    } else {
      failed += 1;
      console.log(`  ✗ ${name}@${entry.version}: ${conflicts.map(describeConflict).join('; ')}`);
    }
  }
  if (failed > 0) {
    console.log(`\n✗ This host would break ${failed} remote(s) on "${options.stand}".`);
    process.exitCode = 1;
  }
};

/** Config deploy job: aggregates `registry/<stand>/*.json` into the stand's `/config.json` read by the host at startup. */
export const runRegistryBuild = (options: RegistryOptions & { out: string }): void => {
  const registryDir = resolve(options.registry);
  readStand(registryDir, options.stand);
  const config = { env: options.stand, remotes: readEntries(registryDir, options.stand) };
  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`✔ ${options.stand} config: ${Object.keys(config.remotes).length} remote(s) → ${out}`);
};

const requiredOf = (shared: ReadonlyArray<{ name: string; requiredVersion?: string }>, name: string) =>
  shared.find((entry) => entry.name === name)?.requiredVersion ?? '—';

/** Who runs which version where — built from the registry and the published manifests. */
export const runRegistryStatus = async (options: { registry: string; stands?: string }): Promise<void> => {
  const registryDir = resolve(options.registry);
  const stands = (options.stands ?? 'local,uat,prod').split(',');
  const rows: string[][] = [['stand', 'remote', 'version', 'react', 'react-router', '@portal-poc/ds', 'bridge build']];
  for (const stand of stands) {
    for (const [name, entry] of Object.entries(readEntries(registryDir, stand))) {
      const shared = await readJsonSource(entry.manifest)
        .then((value) => toManifest(value, entry.manifest).shared)
        .catch(() => null);
      rows.push([
        stand,
        name,
        entry.version,
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

