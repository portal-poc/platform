import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { listFilesRecursive } from '../lib/fs.ts';
import { readHostCompat } from '../lib/host-compat.ts';
import { verifyRemote } from './verify-remote.ts';
import type { RemoteManifest, VerifyMode } from './verify-remote.ts';

type VerifyOptions = { dir?: string; dist?: string; mode?: VerifyMode; against?: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toManifest = (value: unknown): RemoteManifest => {
  if (!isRecord(value) || typeof value['name'] !== 'string' || !Array.isArray(value['exposes']) || !Array.isArray(value['shared'])) {
    throw new Error('dist/mf-manifest.json has an unexpected shape.');
  }
  return {
    name: value['name'],
    exposes: value['exposes'].filter(isRecord).map((expose) => ({ path: String(expose['path']) })),
    shared: value['shared'].filter(isRecord).map((entry) => ({
      name: String(entry['name']),
      ...(typeof entry['singleton'] === 'boolean' ? { singleton: entry['singleton'] } : {}),
      ...(typeof entry['requiredVersion'] === 'string' ? { requiredVersion: entry['requiredVersion'] } : {}),
    })),
  };
};

const readContractVersion = (appDir: string): string | null => {
  try {
    // The installed (resolved) version, not the declared range.
    const pkg: unknown = JSON.parse(readFileSync(join(appDir, 'node_modules/@portal/platform-contract/package.json'), 'utf8'));
    return isRecord(pkg) && typeof pkg['version'] === 'string' ? pkg['version'] : null;
  } catch {
    return null;
  }
};

/** Reads the built manifest + installed packages, prints a report, fails the process on violations. */
export const runVerify = async (options: VerifyOptions): Promise<void> => {
  const appDir = resolve(options.dir ?? '.');
  const distDir = join(appDir, options.dist ?? 'dist');
  const manifestPath = join(distDir, 'mf-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${manifestPath} not found — run the build first.`);
  }
  const configPath = join(distDir, 'config.json');
  const report = verifyRemote({
    manifest: toManifest(JSON.parse(readFileSync(manifestPath, 'utf8'))),
    contractPackageVersion: readContractVersion(appDir),
    mode: options.mode ?? 'integrated',
    builtFiles: listFilesRecursive(distDir)
      .filter((file) => /\.(js|json|html)$/.test(file))
      .map((file) => [relative(appDir, file), readFileSync(file, 'utf8')] as const),
    ...(existsSync(configPath) ? { runtimeConfig: JSON.parse(readFileSync(configPath, 'utf8')) } : {}),
    ...(options.against ? { hostCompat: await readHostCompat(options.against) } : {}),
  });

  console.log(
    `portal-cli verify — ${relative(process.cwd(), distDir)} (${options.mode ?? 'integrated'} mode${options.against ? `, against ${options.against}` : ''})`,
  );
  for (const warning of report.warnings) {
    console.log(`  ⚠ ${warning}`);
  }
  for (const error of report.errors) {
    console.log(`  ✗ ${error}`);
  }
  if (report.errors.length > 0) {
    console.log(`\n✗ Integration contract violated (${report.errors.length} error(s)).`);
    process.exitCode = 1;
    return;
  }
  console.log(`✔ Integration contract OK${report.warnings.length > 0 ? ` (${report.warnings.length} warning(s))` : ''}.`);
};
