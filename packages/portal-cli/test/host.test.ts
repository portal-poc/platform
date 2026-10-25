import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHostSync } from '../src/commands/host.ts';
import { readEntries, readHostEntry, writeHostEntry } from '../src/lib/registry.ts';

const NEXUS = 'https://nexus.example/repository';
const STANDS = {
  dev3: { url: 'https://dev3.example', nexusUrl: NEXUS, snapshot: true },
  dev2: { url: 'https://dev2.example', nexusUrl: NEXUS, branch: 'latest-release' },
};

let registry = '';

beforeEach(() => {
  registry = mkdtempSync(join(tmpdir(), 'portal-registry-'));
  writeFileSync(join(registry, 'stands.json'), JSON.stringify(STANDS));
  mkdirSync(join(registry, 'dev2'));
  writeFileSync(
    join(registry, 'dev2', 'tasks.json'),
    JSON.stringify({ version: '1.7.0-rc.1', manifest: `${NEXUS}/portal-releases/tasks/1.7.0-rc.1/mf-manifest.json`, basePath: '/tasks', scopes: ['s'] }),
  );
  vi.stubEnv('PORTAL_NEXUS_USER', 'portal-deploy');
  vi.stubEnv('PORTAL_NEXUS_PASSWORD', 'secret');
});

afterEach(() => {
  rmSync(registry, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('host entry', () => {
  it('lives next to the remotes but is not one of them', () => {
    expect(writeHostEntry(registry, 'dev2', { version: '1.7.0-rc.4', commit: 'abc' })).toMatch(/dev2\/_host\.json$/);
    expect(writeHostEntry(registry, 'dev2', { version: '1.7.0-rc.4', commit: 'abc' })).toBeNull();

    expect(readHostEntry(registry, 'dev2')).toEqual({ version: '1.7.0-rc.4', commit: 'abc' });
    expect(Object.keys(readEntries(registry, 'dev2'))).toEqual(['tasks']);
    expect(readHostEntry(registry, 'dev3')).toBeNull();
  });
});

describe('host sync', () => {
  const put: string[] = [];

  const stubNexus = (served: string) => {
    put.length = 0;
    const release = `${NEXUS}/portal-releases/host/1.7.0-rc.4`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          put.push(url.replace(`${NEXUS}/portal-stands/dev2/host/`, ''));
          return new Response(null, { status: 201 });
        }
        if (url === 'https://dev2.example/compat.json') {
          return Response.json({ hostVersion: served });
        }
        if (url.includes('/service/rest/v1/assets')) {
          const paths = ['index.html', 'compat.json', 'assets/index-1.js'].map((file) => ({
            id: file,
            path: `/host/1.7.0-rc.4/${file}`,
            lastModified: new Date().toISOString(),
          }));
          return Response.json({ items: paths, continuationToken: null });
        }
        if (url.startsWith(release)) {
          return new Response('file');
        }
        return new Response(null, { status: 404 });
      }),
    );
  };

  it('installs the release the registry names, compat.json and index.html last', async () => {
    writeHostEntry(registry, 'dev2', { version: '1.7.0-rc.4' });
    stubNexus('1.6.0-rc.3');

    await runHostSync({ stand: 'dev2', registry });

    expect(put).toEqual(['assets/index-1.js', 'compat.json', 'index.html']);
  });

  it('leaves a stand that already serves it, the snapshot stand and unversioned stands alone', async () => {
    writeHostEntry(registry, 'dev2', { version: '1.7.0-rc.4' });
    writeHostEntry(registry, 'dev3', { version: 'snapshot' });
    stubNexus('1.7.0-rc.4');

    await runHostSync({ stand: 'dev2', registry });
    await runHostSync({ stand: 'dev3', registry });

    expect(put).toEqual([]);
  });
});
