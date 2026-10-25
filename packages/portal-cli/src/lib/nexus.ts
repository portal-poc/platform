import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nexus raw repository API (the PoC stand-in speaks the same): GET/HEAD/PUT `<nexusUrl>/<repository>/<path>`.
 * Uploads authenticate with PORTAL_NEXUS_USER / PORTAL_NEXUS_PASSWORD (CI secrets of the deploy pipeline only).
 */
const authorization = (): string => {
  const user = process.env['PORTAL_NEXUS_USER'];
  const password = process.env['PORTAL_NEXUS_PASSWORD'];
  if (!user || !password) {
    throw new Error('Set PORTAL_NEXUS_USER and PORTAL_NEXUS_PASSWORD (Nexus deploy credentials).');
  }
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
};

export const isPublished = async (url: string): Promise<boolean> => (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok;

const filesOf = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => statSync(join(dir, file)).isFile());

/**
 * Uploads a build folder to `<baseUrl>/`. `mf-manifest.json` goes LAST: until it is there a release version does not
 * exist, and a snapshot keeps serving its previous complete build (chunks are only added, never deleted, so open tabs
 * still find theirs).
 */
export const uploadDir = async (dir: string, baseUrl: string): Promise<void> => {
  const files = filesOf(dir).toSorted((a, b) => Number(a === 'mf-manifest.json') - Number(b === 'mf-manifest.json'));
  const headers = { Authorization: authorization() };
  for (const file of files) {
    const url = `${baseUrl}/${file.split('\\').join('/')}`;
    const response = await fetch(url, { method: 'PUT', headers, body: readFileSync(join(dir, file)) });
    if (!response.ok) {
      throw new Error(`PUT ${url} → HTTP ${response.status} ${await response.text()}`);
    }
  }
};
