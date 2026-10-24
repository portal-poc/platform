import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Polyrepo dry run. Proves the monorepo is only a convenience:
 * 1. builds and publishes every platform package to a local registry (Verdaccio stands in for Nexus);
 * 2. copies each app into its own directory OUTSIDE the monorepo (no workspace, own .npmrc and lockfile),
 *    replacing `workspace:` ranges with the published versions;
 * 3. runs install → typecheck → lint → test → build → verify in every "repository";
 * 4. generates a brand-new remote with the PUBLISHED CLI and checks it the same way.
 * Start the registry first: `pnpm --filter @portal-tools/polyrepo registry`.
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REGISTRY = process.env['POLYREPO_REGISTRY'] ?? 'http://localhost:4873/';
const TARGET = resolve(process.env['POLYREPO_DIR'] ?? join(REPO_ROOT, '..', 'mfe-poc-polyrepo'));
const WORK_DIR = join(REPO_ROOT, '.polyrepo');

/** Publish order follows the dependency graph. */
const PACKAGES = ['platform-contract', 'mf-shared', 'presets', 'ds', 'platform-runtime', 'vite-config', 'portal-cli'];
const APPS = ['host', 'tasks-remote', 'legacy-remote'];
const CHECKS = ['typecheck', 'lint', 'test', 'build', 'verify'];
const COPY_EXCLUDES = new Set(['node_modules', 'dist', 'dist-bridge', '.vite', '.__mf__temp']);

type PackageJson = {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type StepResult = { repo: string; step: string; ok: boolean; output: string };

const readPackage = (dir: string): PackageJson => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

const userConfig = join(WORK_DIR, 'npmrc');

const run = (command: string, cwd: string): { ok: boolean; output: string } => {
  try {
    const output = execSync(command, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_userconfig: userConfig,
        PORTAL_REGISTRY: REGISTRY,
      },
    });
    return { ok: true, output };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

/**
 * Isolated store + state (incl. the metadata cache) via explicit flags: the dry-run registry is wiped between
 * runs and re-uses version numbers, which a shared pnpm cache serves stale — exactly why real artifacts are immutable.
 */
const PNPM_ISOLATION = `--store-dir ${join(WORK_DIR, 'store')} --state-dir ${join(WORK_DIR, 'state')}`;

/**
 * Every run publishes a NEW version (`1.0.<timestamp>`, still inside `^1.0.0`): re-using a version number makes
 * registries and caches disagree about its content (pnpm then rightly refuses the tarball as a possible supply-chain
 * attack). The monorepo package.json files are restored afterwards.
 */
const DRY_RUN_VERSION = `1.0.${Math.floor(Date.now() / 1000)}`;

const writePackage = (dir: string, pkg: PackageJson) => {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
};

const publishPackages = (): Map<string, string> => {
  const dirs = PACKAGES.map((name) => join(REPO_ROOT, 'packages', name));
  const originals = new Map(dirs.map((dir) => [dir, readFileSync(join(dir, 'package.json'), 'utf8')]));
  const versions = new Map<string, string>();
  try {
    // Bump all first: `pnpm publish` turns workspace: ranges into the dependencies' CURRENT versions.
    for (const dir of dirs) {
      const pkg = readPackage(dir);
      versions.set(pkg.name, DRY_RUN_VERSION);
      writePackage(dir, { ...pkg, version: DRY_RUN_VERSION });
    }
    for (const dir of dirs) {
      const build = run('pnpm build', dir);
      const publish = build.ok ? run(`pnpm publish --registry ${REGISTRY} --no-git-checks`, dir) : build;
      if (!publish.ok) {
        throw new Error(`Publishing ${readPackage(dir).name} failed:\n${publish.output.slice(-2000)}`);
      }
      console.log(`  ✔ ${readPackage(dir).name}@${DRY_RUN_VERSION}`);
    }
  } finally {
    for (const [dir, content] of originals) {
      writeFileSync(join(dir, 'package.json'), content);
    }
  }
  return versions;
};

/** `workspace:^` / `workspace:*` → the published version, exactly what `pnpm publish` does for packages. */
const replaceWorkspaceRanges = (deps: Record<string, string> | undefined, versions: Map<string, string>) => {
  for (const [name, range] of Object.entries(deps ?? {})) {
    if (range.startsWith('workspace:')) {
      const version = versions.get(name);
      if (!version) {
        throw new Error(`${name} is a workspace dependency but not a published platform package`);
      }
      Object.assign(deps ?? {}, { [name]: `^${version}` });
    }
  }
};

const writeRepoFiles = (dir: string) => {
  // Same shape as a real repo: internal scope pinned to the internal registry, everything else via its proxy.
  writeFileSync(join(dir, '.npmrc'), `registry=${REGISTRY}\n@portal-poc:registry=${REGISTRY}\nauto-install-peers=true\n`);
  cpSync(join(REPO_ROOT, '.nvmrc'), join(dir, '.nvmrc'));
};

const splitApp = (app: string, versions: Map<string, string>): string => {
  const target = join(TARGET, app);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(REPO_ROOT, 'apps', app), target, {
    recursive: true,
    filter: (source) => !COPY_EXCLUDES.has(basename(source)) && !/\.env.*\.local$/.test(source),
  });
  const pkg = readPackage(target);
  replaceWorkspaceRanges(pkg.dependencies, versions);
  replaceWorkspaceRanges(pkg.devDependencies, versions);
  writeFileSync(join(target, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  writeRepoFiles(target);
  return target;
};

/** Runs one step and prints `repo › step ✔ 12s` right away, so a long run shows progress. */
const runStep = (repo: string, step: string, command: string, dir: string): StepResult => {
  const startedAt = Date.now();
  const result = { repo, step, ...run(command, dir) };
  console.log(`  ${repo} › ${step} ${result.ok ? '✔' : '✗'} ${Math.round((Date.now() - startedAt) / 1000)}s`);
  return result;
};

const checkRepo = (dir: string): StepResult[] => {
  const repo = basename(dir);
  const scripts = readPackage(dir).scripts ?? {};
  const results: StepResult[] = [runStep(repo, 'install', `pnpm install ${PNPM_ISOLATION}`, dir)];
  for (const step of CHECKS) {
    if (!results.every((result) => result.ok)) {
      break;
    }
    if (scripts[step]) {
      results.push(runStep(repo, step, `pnpm ${step}`, dir));
    }
  }
  return results;
};

const generateRemote = (): string => {
  // A developer machine needs the internal scope pinned globally (~/.npmrc), or `pnpm dlx @portal-poc/cli` asks npmjs.
  // Exact version: `dlx …@latest` is served from pnpm's dlx cache (up to a day old by default).
  writeFileSync(join(TARGET, '.npmrc'), `@portal-poc:registry=${REGISTRY}\n`);
  const dir = join(TARGET, 'reports-remote');
  rmSync(dir, { recursive: true, force: true });
  const created = run(`pnpm ${PNPM_ISOLATION} dlx @portal-poc/cli@${DRY_RUN_VERSION} create remote reports --dir ${dir} --yes --port 5180`, TARGET);
  if (!created.ok) {
    throw new Error(`portal-cli create failed:\n${created.output.slice(-2000)}`);
  }
  return dir;
};

const printSummary = (results: StepResult[]) => {
  console.log('\nrepository        ' + ['install', ...CHECKS].map((step) => step.padEnd(10)).join(''));
  const repos = [...new Set(results.map((result) => result.repo))];
  for (const repo of repos) {
    const row = ['install', ...CHECKS].map((step) => {
      const result = results.find((item) => item.repo === repo && item.step === step);
      return (result ? (result.ok ? '✔' : '✗') : '·').padEnd(10);
    });
    console.log(`${repo.padEnd(18)}${row.join('')}`);
  }
  for (const failure of results.filter((result) => !result.ok)) {
    console.log(`\n✗ ${failure.repo} › ${failure.step}\n${failure.output.trim().split('\n').slice(-25).join('\n')}`);
  }
};

rmSync(join(WORK_DIR, 'store'), { recursive: true, force: true });
rmSync(join(WORK_DIR, 'state'), { recursive: true, force: true });
mkdirSync(WORK_DIR, { recursive: true });
mkdirSync(TARGET, { recursive: true });
writeFileSync(userConfig, `//${new URL(REGISTRY).host}/:_authToken=polyrepo-dry-run\n`);

console.log(`Publishing platform packages to ${REGISTRY}`);
const versions = publishPackages();

console.log(`\nSplitting apps into ${TARGET}`);
const repos = APPS.map((app) => splitApp(app, versions));
console.log(`  ${readdirSync(TARGET).join(', ')}`);

console.log('\nGenerating a new remote with the published CLI');
repos.push(generateRemote());

console.log('');
const results = repos.flatMap(checkRepo);
printSummary(results);
process.exitCode = results.every((result) => result.ok) ? 0 : 1;
