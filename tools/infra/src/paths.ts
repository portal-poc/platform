import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const INFRA_DIR = join(REPO_ROOT, '.infra');
export const NEXUS_DIR = join(INFRA_DIR, 'nexus');
export const NEXUS_PORT = 4400;

export const standDir = (stand: string) => join(INFRA_DIR, 'stands', stand);

export type StandDefinition = { url: string; nexusUrl?: string };

export const readStands = (): Record<string, StandDefinition> =>
  JSON.parse(readFileSync(join(REPO_ROOT, 'registry', 'stands.json'), 'utf8'));
