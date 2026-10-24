import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, standDir } from './paths.ts';

/** PoC "host deploy job": copy the host build to the stand. In real life: upload to the stand's web server/CDN. */
const stand = process.argv[2];
if (!stand) {
  throw new Error('Usage: deploy-host <stand>');
}
const source = join(REPO_ROOT, 'apps', 'host', 'dist');
if (!existsSync(join(source, 'compat.json'))) {
  throw new Error('apps/host/dist/compat.json not found — build the host first.');
}
const target = join(standDir(stand), 'host');
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`✔ Host deployed to stand "${stand}" (${target})`);
