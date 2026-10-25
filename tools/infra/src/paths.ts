import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const INFRA_DIR = join(REPO_ROOT, '.infra');
export const NEXUS_DIR = join(INFRA_DIR, 'nexus');
export const NEXUS_PORT = 4400;

/** Raw hosted repositories, as configured in the real Nexus: releases "Disable redeploy", snapshots "Allow redeploy". */
export const REPOSITORIES: Record<string, { redeploy: boolean }> = {
  'portal-releases': { redeploy: false },
  'portal-snapshots': { redeploy: true },
};

export const standDir = (stand: string) => join(INFRA_DIR, 'stands', stand);

export type StandDefinition = { url: string; nexusUrl?: string };

/**
 * Other repositories: explicit env var, else the monorepo layout, else a sibling clone
 * (`~/projects/portal-poc/{platform,registry,host,...}`).
 */
export const locateRepo = (envName: string, monorepoPath: string, siblingName: string): string => {
  const fromEnv = process.env[envName];
  if (fromEnv) {
    return fromEnv;
  }
  const inMonorepo = join(REPO_ROOT, monorepoPath);
  return existsSync(inMonorepo) ? inMonorepo : join(REPO_ROOT, '..', siblingName);
};

export const readStands = (): Record<string, StandDefinition> =>
  JSON.parse(readFileSync(join(locateRepo('PORTAL_REGISTRY_DIR', 'registry', 'registry'), 'stands.json'), 'utf8'));
