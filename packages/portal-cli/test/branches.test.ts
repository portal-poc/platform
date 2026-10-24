import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { branchOfVersion, standsTrackingBranch } from '../src/lib/branches.ts';

describe('branchOfVersion', () => {
  it('maps dev prereleases to develop and everything else to its release line', () => {
    expect(branchOfVersion('1.6.0-dev.57')).toBe('develop');
    expect(branchOfVersion('1.4.2')).toBe('release/1.4');
    expect(branchOfVersion('1.5.0-rc.1')).toBe('release/1.5');
  });

  it('rejects non-semver versions', () => {
    expect(() => branchOfVersion('latest')).toThrow('not a semver');
  });
});

describe('standsTrackingBranch', () => {
  const registry = mkdtempSync(join(tmpdir(), 'registry-'));
  writeFileSync(
    join(registry, 'stands.json'),
    JSON.stringify({
      dev3: { url: 'http://dev3', branch: 'develop' },
      dev2: { url: 'http://dev2', branch: 'latest-release' },
      dev1: { url: 'http://dev1', branch: 'release/1.4' },
      tst: { url: 'http://tst', promoteFrom: 'dev1' },
    }),
  );

  it.each([
    ['develop', 'release/1.5', ['dev3']],
    ['release/1.5', 'release/1.5', ['dev2']],
    ['release/1.4', 'release/1.5', ['dev1']],
    ['release/1.4', 'release/1.4', ['dev2', 'dev1']],
    ['release/1.3', 'release/1.5', []],
  ])('%s (newest %s) → %o', (branch, latest, stands) => {
    expect(standsTrackingBranch(registry, branch, latest)).toEqual(stands);
  });
});
