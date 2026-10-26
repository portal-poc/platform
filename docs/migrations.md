# Writing a migration

A migration is the code change apps have to make when they move to a new version of a platform package. It ships
with the package, and developers apply it with `portal-cli upgrade` / `portal-cli migrate` in their app
([ADR 0028](./adr/0028-migrations.md)). This page is for platform developers adding one.

## When you need one

- **Yes**: a hook / function signature changes, an export is renamed or moved, an option is renamed or its default
  flips, a file the template generated (vite.config, an expose, `public/config.json`) needs a new field.
- **No**: additive changes (a new option, a new export), changes inside presets / central workflows (apps inherit
  them), bug fixes. A version bump is enough.
- **Breaking?** Ship the new API next to the old one in a minor, mark the old one `@deprecated` (say which migration
  rewrites it), add the migration. Remove the old API in the next major.

## 1. Scaffold

In the package that changed, after bumping its version to the release that brings the change:

```sh
cd packages/platform-runtime
node ../portal-cli/bin/portal-cli.js migration create leave-guard-object   # or: pnpm exec portal-cli migration create …
```

It creates and wires:

| File | What |
|---|---|
| `src/migrations/<id>.ts` | the migration (`id`, `version` = package version or `--version`, `description`, `run`) |
| `src/migrations/<id>.test.ts` | runs every fixture through the real engine, checks manual notes and idempotency |
| `migration-fixtures/<id>/basic.input.tsx` / `.output.tsx` (+ `.jsx`) | before / after pairs |
| `src/migrations/index.ts` | `export const migrations = [...]` — created on the first migration, then appended |
| `package.json` | `exports["./migrations"]` (source in the workspace, dist when published), `@portal-poc/cli` dev dependency |

## 2. Fixtures first

One pair per situation the migration must handle, named `<case>.input.<ext>` / `<case>.output.<ext>`, in `.tsx`
**and** `.jsx` (apps may be JavaScript). Cover at least:

- the common call, with and without options; a multi-line call (layout must survive);
- an aliased import (`{ x as y }`) and a namespace import (`* as runtime`);
- code that must stay as it is: already migrated, a local function with the same name;
- what the migration cannot decide → `<case>.manual.txt`, one expected note per line.

Fixtures are plain files outside `src/` (not type-checked or linted); imports in them are not resolved.

## 3. Write `run`

```ts
import type { Migration } from '@portal-poc/cli/migrations';   // type-only — see "Rules"

export const leaveGuardObject: Migration = {
  id: 'leave-guard-object',
  version: '2.3.0',
  description: 'useLeaveGuard(when, options) → useLeaveGuard({ when, ...options })',
  run: ({ findCalls, morph, replace, manual }) => {
    for (const call of findCalls('@portal-poc/platform-runtime', 'useLeaveGuard')) {
      const [when, options] = call.getArguments();
      if (!when || morph.Node.isSpreadElement(when)) {
        manual('rewrite as useLeaveGuard({ when, ...options })', call);
        continue;
      }
      if (/* already the new shape */ false) continue;
      replace([when, options ?? when], `{ when: ${when.getText()}, … }`);
    }
  },
};
```

The context (`MigrationContext` in `@portal-poc/cli/migrations`):

| | |
|---|---|
| `findCalls(module, export)` | calls of an export of a package, through `{ x }`, `{ x as y }`, `* as ns` |
| `findImports(module, export)` | the import declarations themselves (renames, moving an export to another entry) |
| `replace(node \| [from, to], text)` | exact text replacement, queued and applied after `run` (collected nodes stay valid) |
| `json(path, fn)`, `yaml(path, fn)`, `text(path, fn)` | edit non-code files in place (indent / comments kept); false when missing |
| `write(path, content)`, `exists(path)` | create files |
| `manual(note, node?)` | a step for the developer: printed with file and line, and in the `--report` |
| `project`, `morph` | the ts-morph project (all JS/TS files of the app) and ts-morph itself (`morph.Node.is…`, `SyntaxKind`) |

Types: `node.getType()` works where the app's types resolve (installed node_modules, the app's tsconfig). Use it
to decide ambiguous cases, never as the only signal: fall back to syntax, then to `manual`.

## Rules

- **Idempotent.** Already migrated code comes out unchanged. The generated test applies each fixture twice.
- **Anchor on imports**, never on names: `findCalls` / `findImports`, not a text search.
- **Type-only imports** from `@portal-poc/cli/migrations`. The migration is loaded from the app's
  `node_modules/<your package>/dist/migrations`, where the CLI is not your package's dependency; ts-morph values come
  as `ctx.morph`. Relative imports inside `src/migrations` end in `.js` (Node loads the built files).
- **Prefer `replace`** to ts-morph's own manipulation (`replaceWithText`, `addArgument`…): those re-indent inserted
  text and invalidate nodes you collected.
- **When unsure, report**: a wrong automatic edit costs more than a manual step.
- **Never edit or remove a released migration**: apps jump versions and need every step. Fix forward with a new one.

## 4. Check it on a real app

```sh
pnpm test                                             # in the package
pnpm build                                            # dist/migrations is what apps load
cd ../../../tasks-remote && node ../platform/packages/portal-cli/bin/portal-cli.js migrate --dry-run
```

`migrate --dry-run` runs every migration of the installed packages up to their versions and prints the patch. To
try an unreleased version, link the package into the app (`pnpm link ../platform/packages/<package>`) first.
