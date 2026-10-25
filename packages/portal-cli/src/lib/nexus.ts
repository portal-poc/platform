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

export const uploadFile = async (url: string, body: Buffer | string): Promise<void> => {
  const response = await fetch(url, { method: 'PUT', headers: { Authorization: authorization() }, body });
  if (!response.ok) {
    throw new Error(`PUT ${url} → HTTP ${response.status} ${await response.text()}`);
  }
};

/**
 * Uploads a build folder to `<baseUrl>/`, the `last` files at the end in that order. For a remote that is
 * `remoteEntry.js`, then `mf-manifest.json`: until the manifest is there a release version does not exist, and a
 * snapshot keeps serving its previous complete build (old chunks stay until `pruneStale`, so open tabs still find
 * theirs). The entry has no hash and is overwritten in place, so it goes after every chunk it references: a page
 * loaded mid-upload never gets an entry whose chunks are not there yet. A host ends with `compat.json` and
 * `index.html` for the same reason. Returns the uploaded paths, relative to `baseUrl`.
 */
export const uploadDir = async (
  dir: string,
  baseUrl: string,
  last: readonly string[] = ['remoteEntry.js', 'mf-manifest.json'],
): Promise<string[]> => {
  const files = filesOf(dir)
    .map((file) => file.split('\\').join('/'))
    .toSorted((a, b) => last.indexOf(a) - last.indexOf(b));
  for (const file of files) {
    await uploadFile(`${baseUrl}/${file}`, readFileSync(join(dir, file)));
  }
  return files;
};

type NexusAsset = { id: string; path: string; lastModified: string };
type AssetPage = { items: NexusAsset[]; continuationToken: string | null };

const HOUR_MS = 60 * 60 * 1000;

/** `<nexus>/repository/<repository>/<folder>` → the parts the REST API needs. */
const parseFolderUrl = (url: string) => {
  const match = /^(https?:\/\/[^/]+(?:\/.*?)?)\/repository\/([^/]+)\/(.+?)\/?$/.exec(url);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Not a Nexus repository folder: ${url}`);
  }
  return { api: `${match[1]}/service/rest/v1`, repository: match[2], folder: match[3] };
};

const listAssets = async (api: string, repository: string): Promise<NexusAsset[]> => {
  const assets: NexusAsset[] = [];
  let token: string | null = null;
  do {
    const query = new URLSearchParams({ repository, ...(token ? { continuationToken: token } : {}) });
    const response = await fetch(`${api}/assets?${query}`, { headers: { Authorization: authorization() } });
    if (!response.ok) {
      throw new Error(`GET ${api}/assets → HTTP ${response.status}`);
    }
    const page = (await response.json()) as AssetPage;
    assets.push(...page.items);
    token = page.continuationToken;
  } while (token);
  return assets;
};

/**
 * Overwritten-in-place folders (snapshot remotes, stand hosts) keep the chunks of earlier builds for tabs opened
 * before the upload. This removes, under `<folderUrl>/`, every file the current build does not have (`keep`) that
 * was last uploaded more than `graceHours` ago. Never used on portal-releases (immutable, the deploy user cannot
 * delete there). Returns how many files were deleted.
 */
export const pruneStale = async (folderUrl: string, keep: readonly string[], graceHours = 24): Promise<number> => {
  const { api, repository, folder } = parseFolderUrl(folderUrl);
  const kept = new Set(keep);
  const cutoff = Date.now() - graceHours * HOUR_MS;
  const stale = (await listAssets(api, repository)).filter((asset) => {
    const path = asset.path.replace(/^\//, '');
    return path.startsWith(`${folder}/`) && !kept.has(path.slice(folder.length + 1)) && Date.parse(asset.lastModified) < cutoff;
  });
  for (const asset of stale) {
    const response = await fetch(`${api}/assets/${asset.id}`, { method: 'DELETE', headers: { Authorization: authorization() } });
    if (!response.ok) {
      throw new Error(`DELETE ${asset.path} → HTTP ${response.status}`);
    }
  }
  return stale.length;
};

/** Cleanup is housekeeping: a failure is reported, the deploy itself has already succeeded. */
export const pruneStaleQuietly = async (folderUrl: string, keep: readonly string[]): Promise<void> => {
  try {
    const deleted = await pruneStale(folderUrl, keep);
    if (deleted > 0) {
      console.log(`  Cleanup: ${deleted} file(s) of earlier builds older than a day removed from ${folderUrl}/`);
    }
  } catch (error) {
    console.warn(`  Cleanup skipped (${error instanceof Error ? error.message : String(error)}).`);
  }
};
