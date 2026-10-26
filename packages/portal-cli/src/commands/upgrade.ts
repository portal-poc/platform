import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import semver from 'semver';
import type { EngineResult } from '../migrations/index.ts';
import {
  parsePackageVersions,
  planMigrations,
  readInstalledPlatformPackages,
  readPlatformDependencies,
  runMigrationsInApp,
} from '../lib/migrations.ts';
import { formatManualStep, printEngineResult } from './migrate.ts';

type UpgradeOptions = { dir?: string; to?: string[]; dryRun?: boolean; install?: boolean; checks?: boolean; report?: string };

type PackageManager = 'pnpm' | 'npm' | 'yarn';

export type Bump = { name: string; from: string; to: string; range: string };

type CheckResult = { script: string; ok: boolean; output: string };

const CHECK_SCRIPTS = ['typecheck', 'lint', 'test'] as const;

const detectPackageManager = (root: string): PackageManager => {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(join(root, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
};

const run = (command: string, args: readonly string[], cwd: string) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
};

const latestVersion = (root: string, manager: PackageManager, name: string): string => {
  // `pnpm view` / `npm view` read the app's .npmrc (scope → GitHub Packages / Nexus) and the user's credentials.
  const { ok, output } = run(manager === 'pnpm' ? 'pnpm' : 'npm', ['view', name, 'version'], root);
  const version = output.split('\n').at(-1)?.trim() ?? '';
  if (!ok || !semver.valid(version)) {
    throw new Error(`Could not read the latest version of ${name}: ${output || 'no output'}`);
  }
  return version;
};

/** `^1.2.0` → `^1.4.0`, `~1.2.0` → `~1.4.0`, `1.2.0` → `1.4.0`; other shapes become `^<version>`. */
export const bumpRange = (range: string, version: string): string => {
  const prefix = /^([\^~]?)\d/.exec(range)?.[1];
  return `${prefix ?? '^'}${version}`;
};

const writeBumps = (root: string, bumps: readonly Bump[]): void => {
  const path = join(root, 'package.json');
  const text = readFileSync(path, 'utf8');
  const pkg: Record<string, Record<string, string> | unknown> = JSON.parse(text);
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = pkg[field];
    if (typeof deps === 'object' && deps !== null) {
      for (const bump of bumps) {
        if (bump.name in deps) {
          Object.assign(deps, { [bump.name]: bump.range });
        }
      }
    }
  }
  const indent = /^\{\s*\n([ \t]+)/.exec(text)?.[1] ?? '  ';
  writeFileSync(path, `${JSON.stringify(pkg, null, indent)}\n`);
};

const tail = (text: string, lines: number): string => text.split('\n').slice(-lines).join('\n');

export const renderUpgradeReport = (bumps: readonly Bump[], result: EngineResult | null, checks: readonly CheckResult[]): string => {
  const lines = ['## Platform upgrade', '', '| Package | From | To |', '|---|---|---|'];
  lines.push(...bumps.map((bump) => `| \`${bump.name}\` | ${bump.from} | ${bump.to}${semver.major(bump.to) > semver.major(bump.from) ? ' (major)' : ''} |`));
  lines.push('', '### Migrations', '');
  const outcomes = result?.outcomes ?? [];
  if (outcomes.length === 0) {
    lines.push('None needed: the new versions are drop-in.');
  }
  for (const { packageName, migration, changed } of outcomes) {
    lines.push(`- **${packageName}@${migration.version} \`${migration.id}\`** — ${migration.description}`);
    lines.push(changed.length > 0 ? changed.map((path) => `  - \`${path}\``).join('\n') : '  - nothing to change in this app');
  }
  const manual = outcomes.flatMap((outcome) => outcome.manual);
  if (manual.length > 0) {
    lines.push('', '### Manual steps', '', ...manual.map((step) => `- [ ] ${formatManualStep(step)}`));
  }
  if (checks.length > 0) {
    lines.push('', '### Checks (run by the upgrade)', '');
    for (const check of checks) {
      lines.push(`- ${check.ok ? '✅' : '❌'} \`${check.script}\``);
      if (!check.ok) {
        lines.push('', '  ```', ...tail(check.output, 30).split('\n').map((line) => `  ${line}`), '  ```');
      }
    }
  }
  return `${lines.join('\n')}\n`;
};

/**
 * Bumps the app's @portal-poc packages (latest, or `--to`), installs, runs the migrations of every bumped package
 * from the version the app had, then the app's own checks. `--report` writes a Markdown summary (the upgrade PR body).
 */
export const runUpgrade = async (options: UpgradeOptions): Promise<void> => {
  const root = resolve(options.dir ?? '.');
  const manager = detectPackageManager(root);
  const { installed, missing } = readInstalledPlatformPackages(root);
  if (missing.length > 0) {
    throw new Error(`Not installed: ${missing.join(', ')} — run \`${manager} install\` first (the current versions are the starting point).`);
  }
  const ranges = readPlatformDependencies(root);
  const pinned = parsePackageVersions(options.to);
  const bumps: Bump[] = installed.flatMap((pkg) => {
    const range = ranges.get(pkg.name) ?? '';
    if (range.startsWith('workspace:')) {
      return [];
    }
    const to = pinned.get(pkg.name) ?? latestVersion(root, manager, pkg.name);
    return semver.gt(to, pkg.version) ? [{ name: pkg.name, from: pkg.version, to, range: bumpRange(range, to) }] : [];
  });

  console.log(`portal-cli upgrade — ${manager}, ${installed.length} platform package(s)`);
  for (const bump of bumps) {
    console.log(`  ${bump.name} ${bump.from} → ${bump.to}`);
  }
  if (bumps.length === 0) {
    console.log('✔ Every platform package is at its latest version.');
    return;
  }
  if (options.dryRun) {
    console.log('\n(dry run) Nothing written. Migrations are known after the install: run without --dry-run, or `portal-cli migrate --dry-run` afterwards.');
    return;
  }

  writeBumps(root, bumps);
  if (options.install !== false) {
    console.log(`\n${manager} install…`);
    const install = run(manager, ['install'], root);
    if (!install.ok) {
      throw new Error(`${manager} install failed:\n${tail(install.output, 30)}`);
    }
  }

  const bumped = new Set(bumps.map((bump) => bump.name));
  const after = readInstalledPlatformPackages(root).installed.filter((pkg) => bumped.has(pkg.name));
  const planned = await planMigrations(after, new Map(bumps.map((bump) => [bump.name, bump.from])));
  let result: EngineResult | null = null;
  if (planned.length > 0) {
    console.log(`\nMigrations (${planned.length}):`);
    result = await runMigrationsInApp(root, planned, true);
    printEngineResult(result);
  }

  const checks: CheckResult[] = [];
  if (options.checks !== false) {
    const scripts: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
    for (const script of CHECK_SCRIPTS) {
      if (typeof scripts === 'object' && scripts !== null && script in scripts) {
        console.log(`\n${manager} run ${script}…`);
        const outcome = run(manager, ['run', script], root);
        console.log(outcome.ok ? `  ✔ ${script}` : `  ✗ ${script}\n${tail(outcome.output, 30)}`);
        checks.push({ script, ...outcome });
      }
    }
  }

  const report = renderUpgradeReport(bumps, result, checks);
  if (options.report) {
    writeFileSync(resolve(options.report), report);
    console.log(`\nReport: ${options.report}`);
  }
  const failed = checks.filter((check) => !check.ok).length;
  console.log(failed > 0 ? `\n⚠ Upgraded, ${failed} check(s) failing — see the report.` : '\n✔ Upgraded.');
};
