import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { INFRA_DIR, NEXUS_DIR, NEXUS_PORT, readStands, standDir } from './paths.ts';
import type { StandDefinition } from './paths.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

/** `<name>/<semver>/…` folders are immutable artifacts; everything else (pointers, configs) must not be cached. */
const IMMUTABLE_PATH = /^\/nexus\/[a-z][a-z0-9_]*\/\d+\.\d+\.\d+[^/]*\//;

const safeJoin = (root: string, urlPath: string): string | null => {
  const path = normalize(join(root, decodeURIComponent(urlPath)));
  return path.startsWith(root) ? path : null;
};

const sendFile = (response: ServerResponse, path: string, headers: Record<string, string>) => {
  response.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream', ...headers });
  response.end(readFileSync(path));
};

const notFound = (response: ServerResponse) => {
  response.writeHead(404, { 'Content-Type': 'text/plain' });
  response.end('Not found');
};

const isFile = (path: string | null): path is string => path !== null && existsSync(path) && statSync(path).isFile();

/** Nexus stand-in: immutable remote builds + stand configs (for host dev proxies). CORS open, cache by path. */
const handleNexus = (request: IncomingMessage, response: ServerResponse) => {
  const urlPath = new URL(request.url ?? '/', 'http://x').pathname;
  const path = safeJoin(INFRA_DIR, urlPath);
  if (!isFile(path)) {
    notFound(response);
    return;
  }
  sendFile(response, path, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': IMMUTABLE_PATH.test(urlPath) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
};

const contentSecurityPolicy = (stand: StandDefinition) => {
  const nexusOrigin = `http://localhost:${NEXUS_PORT}`;
  // Remotes are served from ONE Nexus origin, so the CSP stays static; dev overrides add localhost on non-prod stands.
  const remoteSources = stand.allowOverrides ? `${nexusOrigin} http://localhost:*` : nexusOrigin;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${remoteSources}`,
    `connect-src 'self' ${remoteSources} ws://localhost:*`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
  ].join('; ');
};

/** A stand: serves the deployed host build, its compat.json and the stand's /config.json (built from the registry). */
const createStandHandler = (name: string, stand: StandDefinition) => (request: IncomingMessage, response: ServerResponse) => {
  const urlPath = new URL(request.url ?? '/', 'http://x').pathname;
  const hostDir = join(standDir(name), 'host');
  const headers = { 'Content-Security-Policy': contentSecurityPolicy(stand) };
  if (urlPath === '/config.json') {
    const config = join(standDir(name), 'config.json');
    if (isFile(config)) {
      sendFile(response, config, { 'Cache-Control': 'no-cache', ...headers });
    } else {
      notFound(response);
    }
    return;
  }
  const file = safeJoin(hostDir, urlPath);
  if (isFile(file)) {
    const cache = urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    sendFile(response, file, { 'Cache-Control': cache, 'Access-Control-Allow-Origin': '*', ...headers });
    return;
  }
  const index = join(hostDir, 'index.html');
  if (!extname(urlPath) && isFile(index)) {
    sendFile(response, index, { 'Cache-Control': 'no-cache', ...headers });
    return;
  }
  notFound(response);
};

createServer(handleNexus).listen(NEXUS_PORT, () => {
  console.log(`[infra] nexus  http://localhost:${NEXUS_PORT}/nexus/  (dir ${NEXUS_DIR})`);
});

for (const [name, stand] of Object.entries(readStands())) {
  if (!stand.nexusUrl) {
    continue; // `local` is served by the dev servers themselves
  }
  const port = Number(new URL(stand.url).port);
  createServer(createStandHandler(name, stand)).listen(port, () => {
    console.log(`[infra] stand ${name.padEnd(5)} ${stand.url}`);
  });
}
