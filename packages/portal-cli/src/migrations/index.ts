/// <reference types="node" />
// `@portal-poc/cli/migration-kit`: what platform packages need to write and test migrations for apps (docs/migrations.md).
// Migration modules import only TYPES from here (they are loaded from the app's node_modules, where the CLI is not
// their dependency); tests use applyMigration / loadFixtures. One module on purpose: packages type-check it with their
// own tsconfig, which allows `.ts` only in type imports.
import { readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as morph from 'ts-morph';
import { Project, ts } from 'ts-morph';
import type { CallExpression, Node, SourceFile } from 'ts-morph';
import { parseDocument } from 'yaml';
import type { ImportedName, Migration, MigrationContext } from './types.ts';

export type { ImportedName, Migration, MigrationContext, MigrationsModule } from './types.ts';
// ts-morph node types for helpers inside migrations (packages do not depend on ts-morph themselves).
export type { CallExpression, Node, SourceFile } from 'ts-morph';

/** Where the context reads files the project does not hold (JSON, YAML, workflows…): the disk, or a test's map. */
export type FileStore = { read: (path: string) => string | undefined };

export type PlannedMigration = { packageName: string; migration: Migration };

export type ManualStep = { migration: string; note: string; file?: string; line?: number };

export type MigrationOutcome = PlannedMigration & { changed: string[]; manual: ManualStep[] };

/** One file the migrations changed: `before` undefined = created. Paths are relative to the root, `/`-separated. */
export type FileChange = { path: string; before: string | undefined; after: string };

export type EngineResult = { outcomes: MigrationOutcome[]; changes: FileChange[] };

export const CODE_FILE = /\.[cm]?[jt]sx?$/;

const detectIndent = (text: string): string => /^\{\s*\n([ \t]+)/.exec(text)?.[1] ?? '  ';

/**
 * Runs migrations in order against one project + store and reports what each one touched. Writes nothing: the caller
 * decides (dry run, check, commit to disk, a test's map).
 */
export const runMigrationsOn = async (
  root: string,
  project: Project,
  store: FileStore,
  planned: readonly PlannedMigration[],
): Promise<EngineResult> => {
  const toRelative = (path: string): string => (isAbsolute(path) ? relative(root, path) : path).split('\\').join('/');
  const toAbsolute = (path: string): string => posix.join(root.split('\\').join('/'), path);

  const originalCode = new Map(project.getSourceFiles().map((file) => [toRelative(file.getFilePath()), file.getFullText()]));
  const originalOther = new Map<string, string | undefined>();
  const overlay = new Map<string, string>();

  const readOther = (path: string): string | undefined => {
    if (overlay.has(path)) {
      return overlay.get(path);
    }
    if (!originalOther.has(path)) {
      originalOther.set(path, store.read(path));
    }
    return originalOther.get(path);
  };

  const snapshot = (): Map<string, string> =>
    new Map([
      ...project.getSourceFiles().map((file) => [toRelative(file.getFilePath()), file.getFullText()] as const),
      ...overlay,
    ]);

  const findImports = (module: string, exportName: string): ImportedName[] =>
    project.getSourceFiles().flatMap((file) =>
      file
        .getImportDeclarations()
        .filter((declaration) => declaration.getModuleSpecifierValue() === module)
        .flatMap((declaration): ImportedName[] => {
          const namespace = declaration.getNamespaceImport();
          if (namespace) {
            return [{ local: `${namespace.getText()}.${exportName}`, file, declaration }];
          }
          return declaration
            .getNamedImports()
            .filter((named) => named.getName() === exportName)
            .map((named) => ({ local: named.getAliasNode()?.getText() ?? exportName, file, declaration }));
        }),
    );

  const findCalls = (module: string, exportName: string): CallExpression[] =>
    findImports(module, exportName)
      .filter(({ declaration }) => !declaration.isTypeOnly())
      .flatMap(({ local, file }) =>
        file
          .getDescendantsOfKind(morph.SyntaxKind.CallExpression)
          .filter((call) => call.getExpression().getText().replace(/\?\./g, '.') === local),
      );

  const editOther = (path: string, update: (text: string) => string): boolean => {
    const current = readOther(path);
    if (current === undefined) {
      return false;
    }
    const next = update(current);
    if (next !== current) {
      overlay.set(path, next);
    }
    return true;
  };

  const outcomes: MigrationOutcome[] = [];
  for (const item of planned) {
    const before = snapshot();
    const manual: ManualStep[] = [];
    const replacements: { file: SourceFile; start: number; end: number; text: string }[] = [];
    const context: MigrationContext = {
      root,
      project,
      morph,
      findCalls,
      findImports,
      replace: (target, text) => {
        const [from, to] = Array.isArray(target) ? target : [target, target];
        replacements.push({ file: from.getSourceFile(), start: from.getStart(), end: to.getEnd(), text });
      },
      json: (path, update) =>
        editOther(path, (text) => {
          const value: Record<string, unknown> = JSON.parse(text);
          update(value);
          return `${JSON.stringify(value, null, detectIndent(text))}${text.endsWith('\n') ? '\n' : ''}`;
        }),
      yaml: (path, update) =>
        editOther(path, (text) => {
          const document = parseDocument(text);
          update(document);
          return document.toString();
        }),
      text: editOther,
      write: (path, content) => {
        if (CODE_FILE.test(path)) {
          project.createSourceFile(toAbsolute(path), content, { overwrite: true });
        } else {
          readOther(path);
          overlay.set(path, content);
        }
      },
      exists: (path) => project.getSourceFile(toAbsolute(path)) !== undefined || readOther(path) !== undefined,
      manual: (note: string, at?: Node) => {
        manual.push({
          migration: item.migration.id,
          note,
          ...(at ? { file: toRelative(at.getSourceFile().getFilePath()), line: at.getStartLineNumber() } : {}),
        });
      },
    };
    await item.migration.run(context);
    replacements.sort((a, b) => b.start - a.start);
    replacements.forEach((replacement, index) => {
      const next = replacements[index - 1];
      if (next && next.file === replacement.file && next.start < replacement.end) {
        throw new Error(`${item.migration.id}: overlapping replace() in ${toRelative(replacement.file.getFilePath())}.`);
      }
      replacement.file.replaceText([replacement.start, replacement.end], replacement.text);
    });
    const after = snapshot();
    const changed = [...after].filter(([path, text]) => before.get(path) !== text).map(([path]) => path);
    outcomes.push({ ...item, changed, manual });
  }

  const final = snapshot();
  const changes: FileChange[] = [...final]
    .map(([path, after]) => ({ path, before: originalCode.has(path) ? originalCode.get(path) : originalOther.get(path), after }))
    .filter((change) => change.before !== change.after)
    .toSorted((a, b) => a.path.localeCompare(b.path));
  return { outcomes, changes };
};

export type AppliedMigration = {
  /** Every file after the run (unchanged ones included), by path. */
  files: Record<string, string>;
  /** Paths the migration changed or created. */
  changed: string[];
  manual: ManualStep[];
};

/**
 * Runs one migration on in-memory files (`{ 'src/page.tsx': '…' }`) — the same engine `portal-cli migrate` uses on
 * disk. Imports are not resolved (no node_modules), which is how migrations must work anyway: from import specifiers.
 */
export const applyMigration = async (migration: Migration, files: Record<string, string>): Promise<AppliedMigration> => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
  });
  const other = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    if (CODE_FILE.test(path)) {
      project.createSourceFile(`/${path}`, text);
    } else {
      other.set(path, text);
    }
  }
  const { changes, outcomes } = await runMigrationsOn('/', project, { read: (path) => other.get(path) }, [
    { packageName: 'test', migration },
  ]);
  const result = { ...files };
  for (const change of changes) {
    result[change.path] = change.after;
  }
  return { files: result, changed: changes.map((change) => change.path), manual: outcomes.flatMap((outcome) => outcome.manual) };
};

export type MigrationFixture = {
  /** `<case> (<ext>)`, for `it.each(…)('$name', …)`. */
  name: string;
  /** Where the input sits in the in-memory app: `src/<case>.<ext>`. */
  file: string;
  input: string;
  output: string;
  /** Expected `ctx.manual` notes, one per line of `<case>.manual.txt` (none: empty). */
  manual: string[];
};

/**
 * Reads `<case>.input.<ext>` / `<case>.output.<ext>` pairs (+ optional `<case>.manual.txt`) from a fixtures directory.
 * Use one pair per situation the migration must handle, and the same case in `.tsx` and `.jsx`: apps may be JS.
 */
export const loadFixtures = (directory: URL): MigrationFixture[] => {
  const dir = fileURLToPath(directory);
  const names = readdirSync(dir);
  return names
    .flatMap((name) => {
      const match = /^(.+)\.input\.([cm]?[jt]sx?)$/.exec(name);
      return match ? [{ name, caseName: match[1] ?? name, ext: match[2] ?? 'ts' }] : [];
    })
    .map(({ name, caseName, ext }) => {
      const outputName = `${caseName}.output.${ext}`;
      if (!names.includes(outputName)) {
        throw new Error(`${dir}: ${name} has no ${outputName}`);
      }
      const manualName = `${caseName}.manual.txt`;
      return {
        name: `${caseName} (.${ext})`,
        file: `src/${caseName}.${ext}`,
        input: readFileSync(`${dir}/${name}`, 'utf8'),
        output: readFileSync(`${dir}/${outputName}`, 'utf8'),
        manual: names.includes(manualName)
          ? readFileSync(`${dir}/${manualName}`, 'utf8')
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
          : [],
      };
    });
};
