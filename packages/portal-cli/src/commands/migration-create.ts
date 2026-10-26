import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import semver from 'semver';
import { Node, Project, QuoteKind } from 'ts-morph';
import { findWorkspaceRoot } from '../lib/fs.ts';
import { isKebabCase } from '../lib/text.ts';

type MigrationCreateOptions = { dir?: string; version?: string };

const toCamelCase = (id: string): string => id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());

const migrationSource = (id: string, version: string, packageName: string) => `import type { Migration } from '@portal-poc/cli/migrations';

/**
 * TODO: what changed in ${packageName} ${version} and why apps have to follow. Keep it idempotent: code that is
 * already migrated must come out unchanged (the test runs every fixture twice).
 */
export const ${toCamelCase(id)}: Migration = {
  id: '${id}',
  version: '${version}',
  description: 'TODO: one line for the upgrade report — what changes in the app',
  run: ({ findCalls, morph, replace, manual }) => {
    for (const call of findCalls('${packageName}', 'TODO_exportName')) {
      const args = call.getArguments();
      const [first] = args;
      if (!first || args.some((arg) => morph.Node.isSpreadElement(arg))) {
        manual('TODO: say what the developer has to change here', call);
        continue;
      }
      // TODO: \`continue\` when the call already has the new shape; otherwise rewrite it, e.g. all arguments:
      // replace([first, args.at(-1) ?? first], \`{ … }\`);
    }
  },
};
`;

const testSource = (id: string) => `// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyMigration, loadFixtures } from '@portal-poc/cli/migrations';
import { ${toCamelCase(id)} } from './${id}.js';

// One input/output pair per situation, each in .tsx and .jsx (apps may be JS): migration-fixtures/${id}/.
describe(\`migration \${${toCamelCase(id)}.id}\`, () => {
  it.each(loadFixtures(new URL('../../migration-fixtures/${id}/', import.meta.url)))('$name', async (fixture) => {
    const result = await applyMigration(${toCamelCase(id)}, { [fixture.file]: fixture.input });
    expect(result.files[fixture.file]).toBe(fixture.output);
    expect(result.manual.map((step) => step.note)).toEqual(fixture.manual);
    // Idempotent: the migrated code is left as it is.
    expect((await applyMigration(${toCamelCase(id)}, result.files)).changed).toEqual([]);
  });
});
`;

const fixture = (packageName: string, jsx: boolean) => `import { TODO_exportName } from '${packageName}';

export const Example = () => {
  TODO_exportName();
  return ${jsx ? '<div />' : 'null'};
};
`;

const INDEX_HEADER = `import type { Migration } from '@portal-poc/cli/migrations';

/**
 * Run in apps by \`portal-cli upgrade\` (and \`migrate\`) after they bump this package, in version order.
 * Add one with \`portal-cli migration create <id>\` — never edit or remove a released migration.
 */
export const migrations: readonly Migration[] = [];
`;

const writeNew = (path: string, content: string, root: string): void => {
  if (existsSync(path)) {
    throw new Error(`${relative(root, path)} already exists.`);
  }
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  console.log(`  + ${relative(root, path)}`);
};

/** Registers the new migration in src/migrations/index.ts (created on the first migration), keeping the file's code. */
const registerMigration = (indexPath: string, id: string): void => {
  const project = new Project({ manipulationSettings: { quoteKind: QuoteKind.Single } });
  const file = project.addSourceFileAtPath(indexPath);
  const name = toCamelCase(id);
  file.addImportDeclaration({ moduleSpecifier: `./${id}.js`, namedImports: [name] });
  const list = file.getVariableDeclaration('migrations')?.getInitializer();
  if (!list || !Node.isArrayLiteralExpression(list)) {
    throw new Error(`${indexPath}: expected \`export const migrations = [...]\`.`);
  }
  list.addElement(name);
  file.saveSync();
};

/** Makes the package expose `./migrations` (source in the workspace, dist when published) and type it with the CLI. */
const wireManifest = (packageDir: string, cliVersion: string): string[] => {
  const path = join(packageDir, 'package.json');
  const text = readFileSync(path, 'utf8');
  const pkg = JSON.parse(text) as Record<string, Record<string, unknown> | undefined>;
  const changes: string[] = [];
  const exportsField = pkg['exports'];
  if (exportsField && typeof exportsField === 'object' && !('./migrations' in exportsField)) {
    const usesSource = Object.values(exportsField).some((target) => typeof target === 'string' && target.startsWith('./src/'));
    exportsField['./migrations'] = usesSource ? './src/migrations/index.ts' : './dist/migrations/index.js';
    changes.push('exports["./migrations"]');
  }
  const published = pkg['publishConfig']?.['exports'];
  if (published && typeof published === 'object' && !('./migrations' in published)) {
    Object.assign(published, { './migrations': { types: './dist/migrations/index.d.ts', import: './dist/migrations/index.js' } });
    changes.push('publishConfig.exports["./migrations"]');
  }
  const devDependencies = (pkg['devDependencies'] ??= {});
  if (!('@portal-poc/cli' in devDependencies)) {
    devDependencies['@portal-poc/cli'] = findWorkspaceRoot(packageDir) ? 'workspace:*' : `^${cliVersion}`;
    changes.push('devDependencies["@portal-poc/cli"]');
  }
  if (changes.length > 0) {
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return changes;
};

/**
 * Scaffolds a migration in a platform package: the migration, its fixture test, a TSX and a JSX fixture pair, the
 * registration in src/migrations/index.ts and the package's `./migrations` export.
 */
export const runMigrationCreate = (id: string, options: MigrationCreateOptions, cliVersion: string): void => {
  if (!isKebabCase(id)) {
    throw new Error(`Migration id must be kebab-case (e.g. leave-guard-object), got "${id}".`);
  }
  const packageDir = resolve(options.dir ?? '.');
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${manifestPath} not found — run it in the platform package that changed.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; version?: string };
  const packageName = manifest.name ?? '';
  if (!packageName.startsWith('@portal-poc/')) {
    throw new Error(`Migrations belong to @portal-poc packages (this is "${packageName}").`);
  }
  const version = options.version ?? manifest.version ?? '';
  if (!semver.valid(version)) {
    throw new Error(`--version must be a semver version (the release that needs the migration), got "${version}".`);
  }

  console.log(`portal-cli migration create — ${packageName}@${version} ${id}`);
  const migrationsDir = join(packageDir, 'src/migrations');
  const fixturesDir = join(packageDir, 'migration-fixtures', id);
  writeNew(join(migrationsDir, `${id}.ts`), migrationSource(id, version, packageName), packageDir);
  writeNew(join(migrationsDir, `${id}.test.ts`), testSource(id), packageDir);
  writeNew(join(fixturesDir, 'basic.input.tsx'), fixture(packageName, true), packageDir);
  writeNew(join(fixturesDir, 'basic.output.tsx'), fixture(packageName, true), packageDir);
  writeNew(join(fixturesDir, 'basic.input.jsx'), fixture(packageName, true), packageDir);
  writeNew(join(fixturesDir, 'basic.output.jsx'), fixture(packageName, true), packageDir);
  const indexPath = join(migrationsDir, 'index.ts');
  if (!existsSync(indexPath)) {
    writeNew(indexPath, INDEX_HEADER, packageDir);
  }
  registerMigration(indexPath, id);
  console.log(`  ~ src/migrations/index.ts (registered ${toCamelCase(id)})`);
  for (const change of wireManifest(packageDir, cliVersion)) {
    console.log(`  ~ package.json ${change}`);
  }
  if (options.version === undefined) {
    console.log(`\nversion ${version} = the package version: bump the package first when the change goes into the next release.`);
  }
  console.log(
    '\nNext: write the fixtures (input = code before, output = after; add cases the migration must leave alone or report),' +
      `\nthen the migration, then \`pnpm test\`. Guide: docs/migrations.md.`,
  );
};
