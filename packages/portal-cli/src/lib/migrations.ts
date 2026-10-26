import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTwoFilesPatch } from 'diff';
import semver from 'semver';
import { Project, ts } from 'ts-morph';
import { CODE_FILE, runMigrationsOn } from '../migrations/index.ts';
import type { EngineResult, FileChange, PlannedMigration } from '../migrations/index.ts';
import type { Migration } from '../migrations/types.ts';

export const PLATFORM_SCOPE = '@portal-poc/';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readJson = (path: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(value)) {
    throw new Error(`${path} is not a JSON object.`);
  }
  return value;
};

export type InstalledPackage = { name: string; version: string; dir: string };

/** `@portal-poc/*` names the app depends on (dependencies + devDependencies), with their declared ranges. */
export const readPlatformDependencies = (root: string): Map<string, string> => {
  const pkg = readJson(join(root, 'package.json'));
  const ranges = new Map<string, string>();
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = pkg[field];
    if (isRecord(deps)) {
      for (const [name, range] of Object.entries(deps)) {
        if (name.startsWith(PLATFORM_SCOPE) && typeof range === 'string') {
          ranges.set(name, range);
        }
      }
    }
  }
  return ranges;
};

/** Node's lookup: node_modules of the app, then of every parent (hoisted installs, monorepos). */
const findPackageDir = (root: string, name: string): string | null => {
  let current = resolve(root);
  for (;;) {
    const candidate = join(current, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

/** The installed (resolved) version of every platform package the app depends on; missing ones are reported. */
export const readInstalledPlatformPackages = (root: string): { installed: InstalledPackage[]; missing: string[] } => {
  const installed: InstalledPackage[] = [];
  const missing: string[] = [];
  for (const name of readPlatformDependencies(root).keys()) {
    const dir = findPackageDir(root, name);
    const version = dir ? readJson(join(dir, 'package.json'))['version'] : undefined;
    if (dir && typeof version === 'string') {
      installed.push({ name, version, dir });
    } else {
      missing.push(name);
    }
  }
  return { installed: installed.toSorted((a, b) => a.name.localeCompare(b.name)), missing };
};

const exportTarget = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value)) {
    for (const condition of ['import', 'node', 'default']) {
      const target = exportTarget(value[condition]);
      if (target) {
        return target;
      }
    }
  }
  return null;
};

const isMigration = (value: unknown): value is Migration =>
  isRecord(value) &&
  typeof value['id'] === 'string' &&
  typeof value['version'] === 'string' &&
  semver.valid(value['version']) !== null &&
  typeof value['description'] === 'string' &&
  typeof value['run'] === 'function';

/**
 * The file to import for a package's `./migrations`. A workspace package points it at its TypeScript source, which
 * Node cannot load (relative `.js` imports): its built entry (`publishConfig.exports`) is used when it exists.
 */
const migrationsEntry = (pkg: InstalledPackage): string | null => {
  const manifest = readJson(join(pkg.dir, 'package.json'));
  const exportsField = manifest['exports'];
  const target = isRecord(exportsField) ? exportTarget(exportsField['./migrations']) : null;
  if (!target?.endsWith('.ts')) {
    return target;
  }
  const publishConfig = manifest['publishConfig'];
  const published = isRecord(publishConfig) && isRecord(publishConfig['exports']) ? exportTarget(publishConfig['exports']['./migrations']) : null;
  if (!published || !existsSync(join(pkg.dir, published))) {
    throw new Error(`${pkg.name}: ./migrations points to TypeScript sources — build the package first (pnpm build).`);
  }
  return published;
};

/** The package's `./migrations` export (`{ migrations: Migration[] }`), or none. */
export const loadPackageMigrations = async (pkg: InstalledPackage): Promise<Migration[]> => {
  const entry = migrationsEntry(pkg);
  if (!entry) {
    return [];
  }
  const module: unknown = await import(pathToFileURL(join(pkg.dir, entry)).href);
  const migrations = isRecord(module) ? module['migrations'] : undefined;
  if (!Array.isArray(migrations)) {
    throw new Error(`${pkg.name}/migrations must export \`migrations\` (an array).`);
  }
  const ids = new Set<string>();
  return migrations.map((migration: unknown, index) => {
    if (!isMigration(migration)) {
      throw new Error(`${pkg.name}/migrations: entry ${index} is not a migration ({ id, version, description, run }).`);
    }
    if (ids.has(migration.id)) {
      throw new Error(`${pkg.name}/migrations: duplicate id "${migration.id}".`);
    }
    ids.add(migration.id);
    return migration;
  });
};

/**
 * What runs: a package's migrations up to its installed version, and above `from` when the app came from a known
 * version (`upgrade` knows it; `migrate --from`). Without `from` every migration up to the installed version runs —
 * safe because migrations are idempotent, and how `migrate --check` finds what an app still has to apply.
 */
export const planMigrations = async (
  installed: readonly InstalledPackage[],
  from: ReadonlyMap<string, string>,
  only?: ReadonlySet<string>,
): Promise<PlannedMigration[]> => {
  const planned: PlannedMigration[] = [];
  for (const pkg of installed) {
    const since = from.get(pkg.name);
    const migrations = (await loadPackageMigrations(pkg))
      .filter((migration) => semver.lte(migration.version, pkg.version))
      .filter((migration) => !since || semver.gt(migration.version, since))
      .filter((migration) => !only || only.has(migration.id))
      .toSorted((a, b) => semver.compare(a.version, b.version));
    planned.push(...migrations.map((migration) => ({ packageName: pkg.name, migration })));
  }
  return planned;
};

const SKIPPED_DIRS = new Set(['node_modules', '.git', 'coverage', 'build', '.__mf__temp', '.turbo']);

const listCodeFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) || /^dist(-|$)/.test(entry.name) ? [] : listCodeFiles(path);
    }
    return CODE_FILE.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });

/**
 * Every JS/TS file of the app in one ts-morph project. The app's tsconfig gives module resolution (types for the
 * migrations that want them); JS is always allowed — teams may write their remote in JS. No tsconfig, or one the
 * bundled TypeScript cannot read: plain ESNext + bundler resolution.
 */
export const createAppProject = (root: string): Project => {
  const compilerOptions = { allowJs: true, jsx: ts.JsxEmit.Preserve, noEmit: true };
  const tsConfigFilePath = join(root, 'tsconfig.json');
  let project: Project | null = null;
  if (existsSync(tsConfigFilePath)) {
    try {
      project = new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: true, compilerOptions });
    } catch {
      project = null;
    }
  }
  project ??= new Project({
    compilerOptions: {
      ...compilerOptions,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });
  for (const file of listCodeFiles(root)) {
    project.addSourceFileAtPath(file);
  }
  return project;
};

/** Runs the plan on the app on disk; `write: false` leaves every file as it was (dry run, check). */
export const runMigrationsInApp = async (root: string, planned: readonly PlannedMigration[], write: boolean): Promise<EngineResult> => {
  const result = await runMigrationsOn(root, createAppProject(root), {
    read: (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined),
  }, planned);
  if (write) {
    for (const change of result.changes) {
      mkdirSync(dirname(join(root, change.path)), { recursive: true });
      writeFileSync(join(root, change.path), change.after);
    }
  }
  return result;
};

export const toPatch = (change: FileChange): string =>
  createTwoFilesPatch(
    change.before === undefined ? '/dev/null' : `a/${change.path}`,
    `b/${change.path}`,
    change.before ?? '',
    change.after,
    undefined,
    undefined,
    { context: 3 },
  );

/** `pkg@version` list (`--from`, `--to`) → map; the scope's own `@` is not a separator. */
export const parsePackageVersions = (values: readonly string[] = []): Map<string, string> =>
  new Map(
    values.map((value) => {
      const at = value.lastIndexOf('@');
      const name = value.slice(0, at);
      const version = value.slice(at + 1);
      if (at <= 0 || !semver.valid(version)) {
        throw new Error(`"${value}" is not <package>@<version> (e.g. @portal-poc/platform-runtime@2.2.1).`);
      }
      return [name, version];
    }),
  );
