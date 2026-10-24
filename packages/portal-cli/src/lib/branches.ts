import { execSync } from 'node:child_process';
import { LATEST_RELEASE, readStand, readStandNames } from './registry.ts';

const RELEASE_BRANCH = /^release\/(\d+)\.(\d+)$/;

/**
 * Which branch built a version — by convention, so CI never has to guess from git history (after a forward merge the
 * same commit is on several branches): `X.Y.Z-dev.N` comes from develop, `X.Y.Z[-rc.N]` from release/X.Y.
 */
export const branchOfVersion = (version: string): string => {
  const match = /^(\d+)\.(\d+)\.\d+(-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    throw new Error(`"${version}" is not a semver version`);
  }
  return match[3]?.startsWith('-dev.') ? 'develop' : `release/${match[1]}.${match[2]}`;
};

const releaseOrder = (branch: string): number => {
  const match = RELEASE_BRANCH.exec(branch);
  return match ? Number(match[1]) * 10_000 + Number(match[2]) : -1;
};

/** The newest release/X.Y of the repository in `dir` (local and origin branches). */
export const latestReleaseBranch = (dir: string): string | undefined => {
  const refs = execSync("git for-each-ref --format='%(refname:short)' refs/heads/release refs/remotes/origin/release", {
    cwd: dir,
    encoding: 'utf8',
  });
  const branches = refs
    .split('\n')
    .map((ref) => ref.trim().replace(/^origin\//, ''))
    .filter((ref) => RELEASE_BRANCH.test(ref));
  return branches.toSorted((a, b) => releaseOrder(b) - releaseOrder(a))[0];
};

/** Stands that receive builds of `branch` automatically (stands.json `branch`). */
export const standsTrackingBranch = (registryDir: string, branch: string, latestRelease: string | undefined): string[] =>
  readStandNames(registryDir).filter((stand) => {
    const tracked = readStand(registryDir, stand).branch;
    return tracked === branch || (tracked === LATEST_RELEASE && branch === latestRelease);
  });

export const isValidTrackedBranch = (branch: string): boolean =>
  branch === 'develop' || branch === LATEST_RELEASE || RELEASE_BRANCH.test(branch);
