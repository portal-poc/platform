import { describeConflict, findSingletonConflicts } from '@portal-poc/mf-shared';
import type { HostCompat } from '@portal-poc/mf-shared';
import { readJsonSource } from './host-compat.ts';
import { toManifest } from './manifest.ts';
import type { RegistryEntry } from './registry.ts';

type GateResult = { status: 'ok' | 'isolated' | 'blocked'; detail: string };

/**
 * Singleton gate for an ALREADY published and verified version against a stand's host (registry check, promote,
 * stand switch): integrated if compatible, isolated if a bridge build exists, blocked otherwise.
 */
export const gateEntry = async (entry: RegistryEntry, hostCompat: HostCompat): Promise<GateResult> => {
  const manifest = toManifest(await readJsonSource(entry.manifest), entry.manifest);
  const conflicts = findSingletonConflicts(manifest.shared, hostCompat.singletons);
  const detail = conflicts.map(describeConflict).join('; ');
  if (conflicts.length === 0) {
    return { status: 'ok', detail };
  }
  return { status: entry.bridgeManifest ? 'isolated' : 'blocked', detail };
};
