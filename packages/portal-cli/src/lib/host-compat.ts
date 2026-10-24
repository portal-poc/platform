import { readFileSync } from 'node:fs';
import type { HostCompat } from '@portal/mf-shared';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Reads a JSON document from a URL (published artifact) or a local path. */
export const readJsonSource = async (source: string): Promise<unknown> => {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`GET ${source} → HTTP ${response.status}`);
    }
    return response.json();
  }
  return JSON.parse(readFileSync(source, 'utf8'));
};

/** The host's published compat.json: what a host deployment provides to remotes. */
export const readHostCompat = async (source: string): Promise<HostCompat> => {
  const value = await readJsonSource(source);
  if (!isRecord(value) || !isRecord(value['singletons']) || !isRecord(value['contract']) || typeof value['hostVersion'] !== 'string') {
    throw new Error(`${source} is not a host compat.json`);
  }
  const contract = value['contract'];
  const remoteTooling = isRecord(value['remoteTooling']) ? value['remoteTooling'] : {};
  return {
    hostVersion: value['hostVersion'],
    contract: { min: Number(contract['min']), max: Number(contract['max']) },
    singletons: Object.fromEntries(Object.entries(value['singletons']).map(([name, version]) => [name, String(version)])),
    remoteTooling: { mfPlugin: String(remoteTooling['mfPlugin'] ?? '*') },
  };
};
