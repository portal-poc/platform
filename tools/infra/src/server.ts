import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { INFRA_DIR, NEXUS_DIR, NEXUS_PORT, readStands, REPOSITORIES, standDir } from './paths.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

const safeJoin = (root: string, urlPath: string): string | null => {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  return path.startsWith(root) ? path : null;
};

const sendFile = (request: IncomingMessage, response: ServerResponse, path: string, headers: Record<string, string>) => {
  response.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream', ...headers });
  response.end(request.method === 'HEAD' ? undefined : readFileSync(path));
};

const sendText = (response: ServerResponse, status: number, text: string, headers: Record<string, string> = {}) => {
  response.writeHead(status, { 'Content-Type': 'text/plain', ...headers });
  response.end(text);
};

const isFile = (path: string | null): path is string => path !== null && existsSync(path) && statSync(path).isFile();

const readBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

/**
 * Nexus raw hosted repository API: `GET|HEAD|PUT /repository/<repo>/<path>`. PUT needs Basic auth (the PoC accepts any
 * credentials); portal-releases answers a redeploy like Nexus with "Disable redeploy" does (409). Releases are cached
 * forever, snapshots revalidate (overwritten in place; remoteEntry.js has no hash in its name).
 */
const handleRepository = async (request: IncomingMessage, response: ServerResponse, repository: string, path: string) => {
  const policy = REPOSITORIES[repository];
  const file = safeJoin(join(NEXUS_DIR, repository), path);
  if (!policy || !file) {
    sendText(response, 404, `Repository not found: ${repository}`);
    return;
  }
  if (request.method === 'PUT') {
    if (!request.headers.authorization?.startsWith('Basic ')) {
      sendText(response, 401, 'Unauthorized', { 'WWW-Authenticate': 'BASIC realm="Sonatype Nexus Repository Manager"' });
      return;
    }
    if (!policy.redeploy && existsSync(file)) {
      sendText(response, 409, `Repository does not allow updating assets: ${repository}`);
      return;
    }
    const body = await readBody(request);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
    sendText(response, 201, '');
    return;
  }
  if (!isFile(file)) {
    sendText(response, 404, 'Not found', { 'Access-Control-Allow-Origin': '*' });
    return;
  }
  sendFile(request, response, file, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': policy.redeploy ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
};

/** Nexus stand-in (+ what the host dev server needs from the PoC infra: the stand list and stand configs). */
const handleNexus = (request: IncomingMessage, response: ServerResponse) => {
  const urlPath = new URL(request.url ?? '/', 'http://x').pathname;
  const repository = /^\/repository\/([^/]+)\/(.+)$/.exec(urlPath);
  if (repository?.[1] && repository[2]) {
    handleRepository(request, response, repository[1], repository[2]).catch((error: unknown) => {
      sendText(response, 500, String(error));
    });
    return;
  }
  if (urlPath === '/stands.json') {
    // Names of the deployed stands, for the host dev server's error messages (PORTAL_STAND typos).
    response.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
    response.end(JSON.stringify(Object.keys(readStands())));
    return;
  }
  const config = /^\/stands\/[a-z0-9-]+\/config\.json$/.test(urlPath) ? safeJoin(INFRA_DIR, urlPath) : null;
  if (isFile(config)) {
    sendFile(request, response, config, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
    return;
  }
  sendText(response, 404, 'Not found');
};

/** Remotes are served from ONE Nexus origin, so the stand CSP never changes when remotes are added or released. */
const contentSecurityPolicy = () => {
  const nexusOrigin = `http://localhost:${NEXUS_PORT}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${nexusOrigin}`,
    `connect-src 'self' ${nexusOrigin}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
  ].join('; ');
};

/** A stand: serves the deployed host build, its compat.json and the stand's /config.json (built from the registry). */
const createStandHandler = (name: string) => (request: IncomingMessage, response: ServerResponse) => {
  const urlPath = new URL(request.url ?? '/', 'http://x').pathname;
  const hostDir = join(standDir(name), 'host');
  const headers = { 'Content-Security-Policy': contentSecurityPolicy() };
  if (urlPath === '/config.json') {
    const config = join(standDir(name), 'config.json');
    if (isFile(config)) {
      sendFile(request, response, config, { 'Cache-Control': 'no-cache', ...headers });
    } else {
      sendText(response, 404, 'Not found');
    }
    return;
  }
  const file = safeJoin(hostDir, urlPath);
  if (isFile(file)) {
    const cache = urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    sendFile(request, response, file, { 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*', ...headers });
    return;
  }
  const index = join(hostDir, 'index.html');
  if (!extname(urlPath) && isFile(index)) {
    sendFile(request, response, index, { 'Cache-Control': 'no-cache', ...headers });
    return;
  }
  sendText(response, 404, 'Not found');
};

createServer(handleNexus).listen(NEXUS_PORT, () => {
  console.log(`[infra] nexus  http://localhost:${NEXUS_PORT}/repository/{${Object.keys(REPOSITORIES).join(',')}}/  (dir ${NEXUS_DIR})`);
});

for (const [name, stand] of Object.entries(readStands())) {
  const { hostname, port } = new URL(stand.url);
  // Hosted stands (https://<stand>.poc.ashirokov.dev) are served by the PoC server, not here; their configs still are
  // (/stands/<stand>/config.json, for the host dev server).
  if (hostname !== 'localhost') {
    continue;
  }
  createServer(createStandHandler(name)).listen(Number(port), () => {
    console.log(`[infra] stand ${name.padEnd(5)} ${stand.url}`);
  });
}
