import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pruneStale, uploadDir } from '../src/lib/nexus.ts';

const NEXUS = 'https://nexus.example';
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

/** Real ids are opaque base64 strings; here: the path with `~` for `/`. */
const asset = (path: string, hoursAgo: number) => ({ id: path.replaceAll('/', '~'), path, lastModified: ago(hoursAgo) });

describe('pruneStale', () => {
  const deleted: string[] = [];

  beforeEach(() => {
    vi.stubEnv('PORTAL_NEXUS_USER', 'portal-deploy');
    vi.stubEnv('PORTAL_NEXUS_PASSWORD', 'secret');
    deleted.length = 0;
    const pages: Record<string, unknown> = {
      first: {
        items: [
          asset('/dev3/tasks/remoteEntry.js', 0),
          asset('/dev3/tasks/assets/new-a1.js', 0),
          asset('/dev3/tasks/assets/old-b2.js', 30),
          asset('/dev3/tasks/assets/recent-c3.js', 2),
        ],
        continuationToken: 'next',
      },
      next: {
        items: [asset('/dev3/tasks/index.html', 48), asset('/dev3/tasks-legacy/assets/x.js', 48), asset('/dev3/legacy/y.js', 48)],
        continuationToken: null,
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        if (init?.method === 'DELETE') {
          deleted.push((url.pathname.split('/').at(-1) ?? '').replaceAll('~', '/'));
          return new Response(null, { status: 204 });
        }
        return Response.json(pages[url.searchParams.get('continuationToken') ?? 'first']);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('deletes only files of the folder that the build does not have and that are older than the grace period', async () => {
    const count = await pruneStale(`${NEXUS}/repository/portal-snapshots/dev3/tasks`, ['remoteEntry.js', 'assets/new-a1.js']);

    // recent-c3.js: an open tab may still need it; tasks-legacy/ and legacy/ are other folders.
    expect(deleted).toEqual(['/dev3/tasks/assets/old-b2.js', '/dev3/tasks/index.html']);
    expect(count).toBe(2);
  });
});

describe('uploadDir', () => {
  let dir = '';

  beforeEach(() => {
    vi.stubEnv('PORTAL_NEXUS_USER', 'portal-deploy');
    vi.stubEnv('PORTAL_NEXUS_PASSWORD', 'secret');
    dir = mkdtempSync(join(tmpdir(), 'portal-upload-'));
    mkdirSync(join(dir, 'assets'));
    for (const file of ['mf-manifest.json', 'remoteEntry.js', 'assets/a-1.js', 'assets/b-2.js', 'config.json']) {
      writeFileSync(join(dir, file), file);
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uploads the unhashed entry after every chunk and the manifest last', async () => {
    const order: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        order.push(url.replace('https://nexus.example/repository/portal-snapshots/dev3/tasks/', ''));
        return new Response(null, { status: 201 });
      }),
    );

    await uploadDir(dir, 'https://nexus.example/repository/portal-snapshots/dev3/tasks');

    expect(order.slice(-2)).toEqual(['remoteEntry.js', 'mf-manifest.json']);
    expect(order).toHaveLength(5);
  });
});
