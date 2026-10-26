import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMigrate } from '../src/commands/migrate.ts';
import { runMigrationCreate } from '../src/commands/migration-create.ts';
import { bumpRange, renderUpgradeReport } from '../src/commands/upgrade.ts';
import { planMigrations } from '../src/lib/migrations.ts';
import { applyMigration } from '../src/migrations/index.ts';
import type { Migration } from '../src/migrations/types.ts';

const RUNTIME_DIR = resolve(import.meta.dirname, '../../platform-runtime');

const tempDirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-migrations-'));
  tempDirs.push(dir);
  return dir;
};

const writeFiles = (root: string, files: Record<string, string>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

const addArgument: Migration = {
  id: 'add-argument',
  version: '1.1.0',
  description: 'oldApi() → oldApi(1)',
  run: ({ findCalls, replace }) => {
    for (const call of findCalls('@portal-poc/example', 'oldApi')) {
      replace(call, `${call.getExpression().getText()}(1)`);
    }
  },
};

describe('migration context', () => {
  it('finds calls through named, aliased and namespace imports, not through other modules or type imports', async () => {
    const result = await applyMigration(addArgument, {
      'src/a.ts': "import { oldApi } from '@portal-poc/example';\noldApi();\n",
      'src/b.ts': "import { oldApi as legacy } from '@portal-poc/example';\nlegacy();\n",
      'src/c.ts': "import * as example from '@portal-poc/example';\nexample.oldApi();\n",
      'src/d.ts': "import { oldApi } from './local';\noldApi();\n",
      'src/e.ts': "import type { oldApi } from '@portal-poc/example';\ntype T = typeof oldApi;\n",
    });
    expect(result.changed).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(result.files['src/a.ts']).toContain('oldApi(1);');
    expect(result.files['src/b.ts']).toContain('legacy(1);');
    expect(result.files['src/c.ts']).toContain('example.oldApi(1);');
  });

  it('edits JSON and YAML keeping their layout, and records manual steps with file and line', async () => {
    const migration: Migration = {
      id: 'configs',
      version: '1.0.0',
      description: 'configs',
      run: ({ json, yaml, findCalls, manual, exists }) => {
        json('public/config.json', (config) => {
          config['realtimeUrl'] = 'wss://bff/ws';
        });
        yaml('.github/workflows/ci.yml', (document) => {
          document.setIn(['jobs', 'ci', 'uses'], 'portal-poc/platform/.github/workflows/app-ci.yml@v3');
        });
        expect(json('missing.json', () => undefined)).toBe(false);
        expect(exists('public/config.json')).toBe(true);
        for (const call of findCalls('@portal-poc/example', 'oldApi')) {
          manual('check this call', call);
        }
      },
    };
    const result = await applyMigration(migration, {
      'public/config.json': '{\n    "bffBaseUrl": "/api"\n}\n',
      '.github/workflows/ci.yml': 'name: CI\n# central pipeline\njobs:\n  ci:\n    uses: portal-poc/platform/.github/workflows/app-ci.yml@v2\n',
      'src/page.tsx': "import { oldApi } from '@portal-poc/example';\n\nexport const x = oldApi();\n",
    });
    expect(result.files['public/config.json']).toBe('{\n    "bffBaseUrl": "/api",\n    "realtimeUrl": "wss://bff/ws"\n}\n');
    expect(result.files['.github/workflows/ci.yml']).toContain('# central pipeline');
    expect(result.files['.github/workflows/ci.yml']).toContain('app-ci.yml@v3');
    expect(result.manual).toEqual([{ migration: 'configs', note: 'check this call', file: 'src/page.tsx', line: 3 }]);
  });

  it('refuses overlapping replacements instead of corrupting the file', async () => {
    const migration: Migration = {
      id: 'overlap',
      version: '1.0.0',
      description: 'overlap',
      run: ({ findCalls, replace }) => {
        const [call] = findCalls('@portal-poc/example', 'oldApi');
        if (call) {
          replace(call, 'a()');
          replace(call.getExpression(), 'b');
        }
      },
    };
    await expect(applyMigration(migration, { 'src/a.ts': "import { oldApi } from '@portal-poc/example';\noldApi();\n" })).rejects.toThrow(
      /overlapping replace\(\) in src\/a\.ts/,
    );
  });
});

describe('planMigrations', () => {
  const packageWith = (version: string, migrations: string[]) => {
    const dir = tempDir();
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: '@portal-poc/example', version, exports: { './migrations': './migrations.js' } }),
      'migrations.js': `export const migrations = [${migrations
        .map((v) => `{ id: 'm-${v}', version: '${v}', description: '${v}', run: () => {} }`)
        .join(', ')}];\n`,
    });
    return { name: '@portal-poc/example', version, dir };
  };

  it('runs what came after the version the app had, up to the installed one, in version order', async () => {
    const pkg = packageWith('2.1.0', ['2.1.0', '1.4.0', '2.0.0', '3.0.0']);
    const planned = await planMigrations([pkg], new Map([['@portal-poc/example', '1.4.0']]));
    expect(planned.map((item) => item.migration.id)).toEqual(['m-2.0.0', 'm-2.1.0']);
  });

  it('without a starting version runs every migration up to the installed one (they are idempotent)', async () => {
    const pkg = packageWith('2.1.0', ['2.1.0', '1.4.0', '3.0.0']);
    expect((await planMigrations([pkg], new Map())).map((item) => item.migration.id)).toEqual(['m-1.4.0', 'm-2.1.0']);
  });
});

describe('portal-cli migrate on an app (the real runtime migration)', () => {
  const createApp = () => {
    const root = tempDir();
    writeFiles(root, {
      'package.json': JSON.stringify({
        name: 'js-remote',
        dependencies: { '@portal-poc/platform-runtime': '^2.3.0' },
        // The CLI's own authoring entry (migration-kit) must not be taken for a migrations module.
        devDependencies: { '@portal-poc/cli': '^2.9.0' },
      }),
      'src/pages/form/FormPage.jsx':
        "import { useLeaveGuard } from '@portal-poc/platform-runtime';\n\nexport const FormPage = ({ dirty }) => {\n  useLeaveGuard(dirty, { message: 'Not saved' });\n  return null;\n};\n",
      'src/pages/save/SavePage.tsx':
        "import { useLeaveGuard } from '@portal-poc/platform-runtime';\n\nexport const SavePage = ({ saving }: { saving: boolean }) => {\n  useLeaveGuard(saving);\n  return null;\n};\n",
      'dist/assets/ignored.js': "import { useLeaveGuard } from '@portal-poc/platform-runtime';\nuseLeaveGuard(true, {});\n",
    });
    mkdirSync(join(root, 'node_modules/@portal-poc'), { recursive: true });
    symlinkSync(RUNTIME_DIR, join(root, 'node_modules/@portal-poc/platform-runtime'), 'dir');
    symlinkSync(resolve(import.meta.dirname, '..'), join(root, 'node_modules/@portal-poc/cli'), 'dir');
    return root;
  };

  it('--check reports pending migrations and changes nothing; migrate rewrites JS and TS sources, not the build output', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const root = createApp();
    const before = readFileSync(join(root, 'src/pages/form/FormPage.jsx'), 'utf8');

    await runMigrate({ dir: root, check: true });
    expect(process.exitCode).toBe(1);
    expect(readFileSync(join(root, 'src/pages/form/FormPage.jsx'), 'utf8')).toBe(before);
    process.exitCode = undefined;

    await runMigrate({ dir: root });
    expect(readFileSync(join(root, 'src/pages/form/FormPage.jsx'), 'utf8')).toContain("useLeaveGuard({ when: dirty, message: 'Not saved' });");
    expect(readFileSync(join(root, 'src/pages/save/SavePage.tsx'), 'utf8')).toContain('useLeaveGuard({ when: saving });');
    expect(readFileSync(join(root, 'dist/assets/ignored.js'), 'utf8')).toContain('useLeaveGuard(true, {});');

    await runMigrate({ dir: root, check: true });
    expect(process.exitCode).toBeUndefined();
  });
});

describe('portal-cli migration create', () => {
  it('scaffolds the migration, its test and fixtures, registers it and wires the package export', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const dir = tempDir();
    writeFiles(dir, {
      'package.json': `${JSON.stringify(
        { name: '@portal-poc/example', version: '1.4.0', exports: { '.': './src/index.ts' }, publishConfig: { exports: { '.': { import: './dist/index.js' } } } },
        null,
        2,
      )}\n`,
    });

    runMigrationCreate('first-change', { dir }, '2.9.0');
    runMigrationCreate('second-change', { dir, version: '1.5.0' }, '2.9.0');

    for (const path of [
      'src/migrations/first-change.ts',
      'src/migrations/first-change.test.ts',
      'migration-fixtures/first-change/basic.input.tsx',
      'migration-fixtures/first-change/basic.output.jsx',
    ]) {
      expect(existsSync(join(dir, path)), path).toBe(true);
    }
    expect(readFileSync(join(dir, 'src/migrations/second-change.ts'), 'utf8')).toContain("version: '1.5.0'");
    const index = readFileSync(join(dir, 'src/migrations/index.ts'), 'utf8');
    expect(index).toContain("import { firstChange } from './first-change.js';");
    expect(index).toContain('[firstChange, secondChange]');
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.exports['./migrations']).toBe('./src/migrations/index.ts');
    expect(pkg.publishConfig.exports['./migrations']).toEqual({ types: './dist/migrations/index.d.ts', import: './dist/migrations/index.js' });
    expect(pkg.devDependencies['@portal-poc/cli']).toBe('^2.9.0');
    expect(() => runMigrationCreate('first-change', { dir }, '2.9.0')).toThrow(/already exists/);
    expect(() => runMigrationCreate('NotKebab', { dir }, '2.9.0')).toThrow(/kebab-case/);
  });
});

describe('portal-cli upgrade helpers', () => {
  it('keeps the range style when bumping', () => {
    expect(bumpRange('^2.2.1', '2.3.0')).toBe('^2.3.0');
    expect(bumpRange('~1.0.0', '1.0.4')).toBe('~1.0.4');
    expect(bumpRange('1.0.0', '1.1.0')).toBe('1.1.0');
    expect(bumpRange('latest', '1.1.0')).toBe('^1.1.0');
  });

  it('reports bumps, migrations, manual steps and failing checks for the PR / commit', () => {
    const report = renderUpgradeReport(
      [{ name: '@portal-poc/platform-runtime', from: '2.2.1', to: '3.0.0', range: '^3.0.0' }],
      {
        changes: [],
        outcomes: [
          {
            packageName: '@portal-poc/platform-runtime',
            migration: { ...addArgument, id: 'leave-guard-object', version: '2.3.0', description: 'object form' },
            changed: ['src/pages/form/FormPage.jsx'],
            manual: [{ migration: 'leave-guard-object', note: 'check it', file: 'src/a.tsx', line: 4 }],
          },
        ],
      },
      [
        { script: 'typecheck', ok: true, output: '' },
        { script: 'test', ok: false, output: 'FAIL src/a.test.ts' },
      ],
    );
    expect(report).toContain('| `@portal-poc/platform-runtime` | 2.2.1 | 3.0.0 (major) |');
    expect(report).toContain('**@portal-poc/platform-runtime@2.3.0 `leave-guard-object`** — object form');
    expect(report).toContain('- [ ] src/a.tsx:4 — check it (leave-guard-object)');
    expect(report).toContain('❌ `test`');
    expect(report).toContain('FAIL src/a.test.ts');
  });
});
