import { describe, expect, it } from 'vitest';
import { branchOfVersion, releaseLineProblem, releaseVersionOf, snapshotVersionOf } from '../src/lib/branches.ts';

describe('branchOfVersion', () => {
  it('maps release versions and release candidates to their line', () => {
    expect(branchOfVersion('1.4.2')).toBe('release/1.4');
    expect(branchOfVersion('1.5.3-rc.12')).toBe('release/1.5');
  });

  it('has no line for snapshot builds and non-semver versions', () => {
    expect(branchOfVersion('1.6.0-snapshot.58+a1b2c3d')).toBeNull();
    expect(branchOfVersion('latest')).toBeNull();
  });
});

describe('releaseVersionOf', () => {
  const tags = ['v1.4.0', 'v1.4.1', 'v1.5.0', 'v1.5.1', 'v1.5.2'];

  it('deploys a tag as exactly its version', () => {
    expect(releaseVersionOf('v1.5.1', tags, '7')).toBe('1.5.1');
  });

  it('builds a release branch as the next patch release candidate', () => {
    expect(releaseVersionOf('release/1.5', tags, '7')).toBe('1.5.3-rc.7');
    expect(releaseVersionOf('release/1.4', tags, '8')).toBe('1.4.2-rc.8');
    expect(releaseVersionOf('release/1.6', tags, '9')).toBe('1.6.0-rc.9');
  });

  it.each(['develop', 'feature/filters', 'v1.5', 'main'])('refuses %s', (ref) => {
    expect(() => releaseVersionOf(ref, tags, '1')).toThrow('cannot go to a release stand');
  });
});

describe('snapshotVersionOf', () => {
  it('identifies the build by run and commit', () => {
    expect(snapshotVersionOf('1.6.0', '58', 'a1b2c3d4e5f6')).toBe('1.6.0-snapshot.58+a1b2c3d');
    expect(snapshotVersionOf('1.6.0-rc.1', '58', 'a1b2c3d4e5f6')).toBe('1.6.0-snapshot.58+a1b2c3d');
  });
});

describe('releaseLineProblem', () => {
  const nexusUrl = 'https://nexus.example/repository';
  const pinned = { url: 'https://dev1.example', nexusUrl, branch: 'release/1.5' };
  const latest = { url: 'https://dev2.example', nexusUrl, branch: 'latest-release' };

  it('accepts versions of the pinned line, rejects others', () => {
    expect(releaseLineProblem(pinned, '1.5.3-rc.2', ['release/1.5'])).toBeNull();
    expect(releaseLineProblem(pinned, '0.1.0', ['release/1.5'])).toBe('0.1.0 is from release/0.1, the stand runs release/1.5');
  });

  it('rejects a latest-release entry older than a pinned line', () => {
    expect(releaseLineProblem(latest, '1.6.0', ['release/1.5'])).toBeNull();
    expect(releaseLineProblem(latest, '1.5.2', ['release/1.5'])).toBeNull();
    expect(releaseLineProblem(latest, '1.4.1', ['release/1.5'])).toContain('older than the pinned release/1.5');
  });

  it('does not check promoted stands', () => {
    expect(releaseLineProblem({ url: 'https://tst.example', nexusUrl, promoteFrom: 'dev1' }, '1.4.1', ['release/1.5'])).toBeNull();
  });
});
