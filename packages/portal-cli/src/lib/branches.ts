import { execSync } from 'node:child_process';
import { LATEST_RELEASE } from './registry.ts';
import type { StandDefinition } from './registry.ts';

const RELEASE_BRANCH = /^release\/(\d+)\.(\d+)$/;
const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

const git = (dir: string, args: string): string => execSync(`git ${args}`, { cwd: dir, stdio: 'pipe', encoding: 'utf8' }).trim();

/**
 * Which release line a version belongs to — by convention, so nothing has to guess from git history (after a forward
 * merge the same commit is on several branches): `X.Y.Z` and `X.Y.Z-rc.N` come from release/X.Y. Anything else
 * (snapshot builds) is not a release build: null.
 */
export const branchOfVersion = (version: string): string | null => {
  const match = /^(\d+)\.(\d+)\.\d+(-rc\.[0-9A-Za-z.]+)?$/.exec(version);
  return match ? `release/${match[1]}.${match[2]}` : null;
};

const releaseOrder = (branch: string): number => {
  const match = RELEASE_BRANCH.exec(branch);
  return match ? Number(match[1]) * 10_000 + Number(match[2]) : -1;
};

/**
 * Offline check of a release stand's entry (registry CI): its version must come from the line the stand runs.
 * A pinned stand knows its line; a `latest-release` stand only knows it cannot be older than any pinned line (the
 * newest release branch lives in the remotes' repositories, not in the registry). Promoted stands are not checked:
 * they lag their source until the next promotion by design.
 */
export const releaseLineProblem = (definition: StandDefinition, version: string, pinnedBranches: readonly string[]): string | null => {
  const line = branchOfVersion(version);
  if (definition.branch === LATEST_RELEASE) {
    const newer = pinnedBranches.find((branch) => releaseOrder(branch) > releaseOrder(line ?? ''));
    if (!line) {
      return `${version} is not a release build`;
    }
    return newer ? `${version} is from ${line}, older than the pinned ${newer}: this stand runs the newest line` : null;
  }
  if (definition.branch && line !== definition.branch) {
    return `${version} is from ${line ?? 'no release line'}, the stand runs ${definition.branch}`;
  }
  return null;
};

/** The newest release/X.Y of the repository in `dir` (local and origin branches). */
export const latestReleaseBranch = (dir: string): string | undefined => {
  const refs = git(dir, "for-each-ref --format='%(refname:short)' refs/heads/release refs/remotes/origin/release");
  const branches = refs
    .split('\n')
    .map((ref) => ref.trim().replace(/^origin\//, ''))
    .filter((ref) => RELEASE_BRANCH.test(ref));
  return branches.toSorted((a, b) => releaseOrder(b) - releaseOrder(a))[0];
};

export const isValidTrackedBranch = (branch: string): boolean => branch === LATEST_RELEASE || RELEASE_BRANCH.test(branch);

/** The branch or tag checked out in `dir`: an exact release tag wins (the newest one if a commit has several). */
export const currentRef = (dir: string): string => {
  const tags = git(dir, 'tag --points-at HEAD --sort=-v:refname').split('\n');
  return tags.find((tag) => RELEASE_TAG.test(tag)) ?? git(dir, 'rev-parse --abbrev-ref HEAD');
};

/** Release tags of the line a ref belongs to (`release/1.5` → v1.5.0, v1.5.1, …) in `dir`. */
export const lineTags = (dir: string, ref: string): string[] => {
  const match = RELEASE_BRANCH.exec(ref);
  return match ? git(dir, `tag --list 'v${match[1]}.${match[2]}.*'`).split('\n').filter(Boolean) : [];
};

/**
 * What a ref deploys as on a release stand: a tag IS its version (`v1.5.2` → 1.5.2, published once, reused by every
 * later deploy); a release branch builds a release candidate of the next patch (`release/1.5` after v1.5.2 →
 * 1.5.3-rc.<run>). Anything else does not go to a release stand.
 */
export const releaseVersionOf = (ref: string, tags: readonly string[], run: string): string => {
  const tag = RELEASE_TAG.exec(ref);
  if (tag) {
    return `${tag[1]}.${tag[2]}.${tag[3]}`;
  }
  const line = RELEASE_BRANCH.exec(ref);
  if (!line) {
    throw new Error(`"${ref}" cannot go to a release stand: deploy a release/X.Y branch or a vX.Y.Z tag (other branches go to the snapshot stand).`);
  }
  const patches = tags.flatMap((name) => {
    const match = RELEASE_TAG.exec(name);
    return match && match[1] === line[1] && match[2] === line[2] ? [Number(match[3])] : [];
  });
  const next = patches.length === 0 ? 0 : Math.max(...patches) + 1;
  return `${line[1]}.${line[2]}.${next}-rc.${run}`;
};

/** A snapshot build is identified, not addressed: `1.6.0-snapshot.<run>+<sha>` shows up in the host's remotes panel. */
export const snapshotVersionOf = (packageVersion: string, run: string, sha: string): string =>
  `${packageVersion.replace(/[-+].*$/, '')}-snapshot.${run}+${sha.slice(0, 7)}`;

export const headSha = (dir: string): string => git(dir, 'rev-parse HEAD');

const shaOf = (dir: string, ref: string): string | null => {
  try {
    return git(dir, `rev-parse --verify --quiet ${ref}^{commit}`);
  } catch {
    return null;
  }
};

/** The build must be of the ref being deployed: a local `--ref` that differs from the checkout would ship other code. */
export const assertCheckedOut = (dir: string, ref: string): void => {
  const head = headSha(dir);
  if (shaOf(dir, ref) !== head && shaOf(dir, `origin/${ref}`) !== head) {
    throw new Error(`"${ref}" is not what is checked out in ${dir} (${currentRef(dir)}): check it out first.`);
  }
};

/**
 * Release stands run one line: `release/X.Y` (pinned, e.g. the pilot on dev1) or `latest-release` (the newest line in
 * the remote's repository, e.g. dev2). Throws with the way out when the version belongs elsewhere.
 */
export const assertLineAccepted = (standName: string, stand: StandDefinition, version: string, appDir: string): void => {
  const line = branchOfVersion(version);
  if (!line) {
    throw new Error(`${version} is not a release build: "${standName}" takes release/X.Y builds and vX.Y.Z tags.`);
  }
  const tracked = stand.branch === LATEST_RELEASE ? latestReleaseBranch(appDir) : stand.branch;
  if (line === tracked) {
    return;
  }
  const wayOut =
    stand.branch === LATEST_RELEASE
      ? `"${standName}" always follows the newest line.`
      : `Or move the stand first: portal-cli stand switch ${standName} --branch ${line}.`;
  throw new Error(`"${standName}" runs ${tracked ?? '(no release branch yet)'}, ${version} is from ${line}. ${wayOut}`);
};
