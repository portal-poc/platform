import type * as Morph from 'ts-morph';
import type { CallExpression, ImportDeclaration, Node, Project, SourceFile } from 'ts-morph';
import type { Document } from 'yaml';

/**
 * A change a platform package ships for the apps that use it: `portal-cli upgrade` / `migrate` runs it in the app's
 * repository after the package was bumped past `version`. Author one with `portal-cli migration create <id>`.
 *
 * Rules (see docs/migrations.md):
 * - Idempotent: running it on already migrated code changes nothing (the CLI test helper checks it).
 * - Anchored on imports of the package (`ctx.findCalls`), never on names alone, so aliases and JS apps work.
 * - Type-only imports from `@portal-poc/cli/migrations`: the module is loaded from the app's node_modules, where the
 *   CLI is not a dependency of your package. ts-morph values (guards, SyntaxKind) come as `ctx.morph`.
 * - What cannot be automated goes to `ctx.manual(...)`: it ends up in the report and the upgrade PR.
 */
export type Migration = {
  /** kebab-case, unique within the package (e.g. `leave-guard-object`). */
  id: string;
  /** The package version that needs it: runs when an app moves from below this version to it or above. */
  version: string;
  /** One line for the report / PR: what changes in the app's code. */
  description: string;
  run: (ctx: MigrationContext) => void | Promise<void>;
};

export type MigrationContext = {
  /** The app's root (absolute in a real run, `/` in tests). Paths below are relative to it. */
  root: string;
  /** Every JS/TS file of the app (TSX/JSX included, node_modules and build output excluded), shared by all migrations. */
  project: Project;
  /** ts-morph itself: `ctx.morph.Node.isObjectLiteralExpression(…)`, `ctx.morph.SyntaxKind.CallExpression`… */
  morph: typeof Morph;
  /**
   * Calls of `exportName` imported from `module` (exact specifier, e.g. `@portal-poc/platform-runtime`), whatever the
   * import looks like: `{ x }`, `{ x as y }`, `* as ns` → `ns.x(…)`. Re-exports through the app's own modules are not
   * followed: report them with `ctx.manual` if your change needs them.
   */
  findCalls: (module: string, exportName: string) => CallExpression[];
  /**
   * Replaces the text of a node, or of everything from the first to the last of `[from, to]` (e.g. all arguments of a
   * call), exactly as written. Queued and applied after `run` returns, from the end of each file: nodes you collected
   * stay valid while you work, and multi-line text is not re-indented. Prefer it to ts-morph's own manipulation.
   */
  replace: (target: Node | readonly [Node, Node], text: string) => void;
  /** Imports of `exportName` from `module` (for renames: change the specifier, then `findCalls` the old local name). */
  findImports: (module: string, exportName: string) => ImportedName[];
  /** Edits a JSON file in place (indentation kept). Returns false when the file does not exist. */
  json: (path: string, update: (value: Record<string, unknown>) => void) => boolean;
  /** Edits a YAML file through `yaml`'s Document API (comments and layout kept). Returns false when missing. */
  yaml: (path: string, update: (document: Document) => void) => boolean;
  /** Edits any other text file. Returns false when missing. */
  text: (path: string, update: (text: string) => string) => boolean;
  /** Creates or overwrites a non-code file (code files: `ctx.project.createSourceFile`). */
  write: (path: string, content: string) => void;
  exists: (path: string) => boolean;
  /** A step a person has to do: listed in the report and the upgrade PR, with the file and line when `at` is given. */
  manual: (note: string, at?: Node) => void;
};

export type ImportedName = {
  /** The name the file uses: the alias, or `ns.exportName` for a namespace import. */
  local: string;
  file: SourceFile;
  declaration: ImportDeclaration;
};

/** What a package exports as `<package>/migrations`. */
export type MigrationsModule = { migrations: readonly Migration[] };
