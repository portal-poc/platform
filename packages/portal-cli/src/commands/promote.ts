import { resolve } from 'node:path';
import { gateEntry } from '../lib/gate.ts';
import { readHostCompat } from '../lib/host-compat.ts';
import {
  HOST_NAME,
  LATEST_RELEASE,
  readEntries,
  readEntry,
  readHostEntry,
  readStand,
  readStandNames,
  releaseUrl,
  SNAPSHOT_VERSION,
  writeEntry,
  writeHostEntry,
  writeStandBranch,
} from '../lib/registry.ts';
import type { RegistryEntry } from '../lib/registry.ts';
import { saveRegistryChange } from '../lib/registry-change.ts';
import type { ChangeMode } from '../lib/registry-change.ts';

/**
 * Copies entries (the SAME immutable versions, nothing is rebuilt) from one stand to another through the singleton
 * gate of the target stand's host — its new host when the host moves too (the whole stand, not `--remote`: the
 * source's versioned host comes along and every remote is checked against it). Route, scopes and title stay the
 * target's own when it already has them. Returns the written files (empty: already up to date), or null when the
 * gate blocked something (nothing written).
 */
const copyEntries = async (registryDir: string, from: string, to: string, only?: string): Promise<string[] | null> => {
  if (readStand(registryDir, from).snapshot) {
    throw new Error(`"${from}" runs snapshots (rebuilt in place): nothing immutable to copy — deploy a release build instead.`);
  }
  const target = readStand(registryDir, to);
  const sourceHost = only ? null : readHostEntry(registryDir, from);
  const targetHost = readHostEntry(registryDir, to);
  const newHost = sourceHost && sourceHost.version !== SNAPSHOT_VERSION && sourceHost.version !== targetHost?.version ? sourceHost : null;
  const hostCompat = await readHostCompat(
    newHost ? `${releaseUrl(target.nexusUrl, HOST_NAME, newHost.version)}/compat.json` : `${target.url}/compat.json`,
  );
  const source = Object.entries(readEntries(registryDir, from)).filter(([name]) => !only || name === only);
  if (source.length === 0) {
    throw new Error(`Nothing to copy: "${from}" has ${only ? `no "${only}"` : 'no remotes'}.`);
  }
  const accepted: Array<[string, RegistryEntry]> = [];
  let blocked = 0;
  console.log(`${from} → ${to} (host ${hostCompat.hostVersion})`);
  if (newHost) {
    console.log(`  ✔ host ${targetHost?.version ?? '(unversioned)'} → ${newHost.version}`);
  }
  for (const [name, entry] of source) {
    const current = readEntry(registryDir, to, name);
    // With a new host, unchanged remotes are checked against it as well.
    if (current?.version === entry.version && !newHost) {
      console.log(`  · ${name} ${entry.version} (unchanged)`);
      continue;
    }
    const gate = await gateEntry(entry, hostCompat);
    const change =
      current?.version === entry.version
        ? `${name} ${entry.version} (unchanged, fits the new host)`
        : `${name} ${current?.version ?? '(new)'} → ${entry.version}`;
    if (gate.status === 'blocked') {
      blocked += 1;
      console.log(`  ✗ ${change}: ${gate.detail}`);
      continue;
    }
    console.log(`  ${gate.status === 'ok' ? '✔' : '⚠'} ${change}${gate.status === 'isolated' ? ` (isolated: ${gate.detail})` : ''}`);
    const placement = current
      ? { basePath: current.basePath, scopes: current.scopes, ...(current.title ? { title: current.title } : {}) }
      : {};
    accepted.push([name, { ...entry, ...placement }]);
  }
  if (blocked > 0) {
    console.log(`\n✗ Blocked: ${blocked} remote(s) are not compatible with the host on "${to}". Registry unchanged.`);
    process.exitCode = 1;
    return null;
  }
  const written = accepted.map(([name, entry]) => writeEntry(registryDir, to, name, entry));
  if (newHost) {
    written.push(writeHostEntry(registryDir, to, newHost));
  }
  return written.filter((path) => path !== null);
};

const finish = (registryDir: string, files: string[], title: string, mode: ChangeMode) => {
  console.log(`\n✔ ${title}`);
  saveRegistryChange(registryDir, files, title, mode);
};

type PromoteOptions = ChangeMode & { registry: string; from: string; to: string; remote?: string };

/** tst never builds anything: it gets exactly what passed the stand it promotes from (stands.json `promoteFrom`). */
export const runPromote = async (options: PromoteOptions): Promise<void> => {
  const registryDir = resolve(options.registry);
  const target = readStand(registryDir, options.to);
  if (target.promoteFrom !== options.from) {
    throw new Error(`"${options.to}" accepts promotions only from "${target.promoteFrom ?? '(none: it tracks a branch)'}".`);
  }
  const files = await copyEntries(registryDir, options.from, options.to, options.remote);
  if (files?.length === 0) {
    console.log(`\n✔ "${options.to}" already runs these versions.`);
  } else if (files) {
    finish(registryDir, files, `${options.to}: promote ${options.remote ?? 'all'} from ${options.from}`, options);
  }
};

type SwitchOptions = ChangeMode & { registry: string; branch: string; from?: string };

/**
 * Moves a stand to another release line (the pilot moves from release/1.4 to release/1.5) in ONE registry change:
 * the stands.json mapping plus the current versions of that line, copied from the stand that runs it now.
 */
export const runStandSwitch = async (stand: string, options: SwitchOptions): Promise<void> => {
  const registryDir = resolve(options.registry);
  const definition = readStand(registryDir, stand);
  if (!definition.branch) {
    throw new Error(`"${stand}" does not run a release line (${definition.snapshot ? 'snapshot stand' : `promoted from ${definition.promoteFrom}`}).`);
  }
  const others = readStandNames(registryDir).filter((name) => name !== stand);
  const from =
    options.from ??
    others.find((name) => readStand(registryDir, name).branch === options.branch) ??
    others.find((name) => readStand(registryDir, name).branch === LATEST_RELEASE);
  if (!from) {
    throw new Error(`No stand runs ${options.branch} yet: pass --from <stand>.`);
  }
  const files = await copyEntries(registryDir, from, stand);
  if (files) {
    files.push(writeStandBranch(registryDir, stand, options.branch));
    finish(registryDir, files, `${stand}: switch to ${options.branch} (versions from ${from})`, options);
  }
};
