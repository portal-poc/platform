import { resolve } from 'node:path';
import type { EngineResult, ManualStep } from '../migrations/index.ts';
import {
  parsePackageVersions,
  planMigrations,
  readInstalledPlatformPackages,
  runMigrationsInApp,
  toPatch,
} from '../lib/migrations.ts';
import { parseList } from '../lib/text.ts';

type MigrateOptions = { dir?: string; from?: string[]; only?: string; dryRun?: boolean; check?: boolean };

export const formatManualStep = (step: ManualStep): string =>
  `${step.file ? `${step.file}${step.line ? `:${step.line}` : ''} — ` : ''}${step.note} (${step.migration})`;

export const printEngineResult = (result: EngineResult): void => {
  for (const outcome of result.outcomes) {
    const { packageName, migration, changed } = outcome;
    console.log(
      `  ${changed.length > 0 ? '✎' : '·'} ${packageName}@${migration.version} ${migration.id} — ${migration.description}` +
        (changed.length > 0 ? `\n      ${changed.join('\n      ')}` : ' (nothing to change)'),
    );
  }
  const manual = result.outcomes.flatMap((outcome) => outcome.manual);
  if (manual.length > 0) {
    console.log('\n  Manual steps:');
    for (const step of manual) {
      console.log(`  ☐ ${formatManualStep(step)}`);
    }
  }
};

/**
 * Applies the migrations of the installed platform packages to the app. `--from` narrows them to what came after a
 * known version (what `upgrade` does); without it every migration up to the installed versions runs (idempotent).
 */
export const runMigrate = async (options: MigrateOptions): Promise<void> => {
  const root = resolve(options.dir ?? '.');
  const { installed, missing } = readInstalledPlatformPackages(root);
  if (missing.length > 0) {
    throw new Error(`Not installed: ${missing.join(', ')} — run the package manager's install first.`);
  }
  const only = options.only ? new Set(parseList(options.only)) : undefined;
  const planned = await planMigrations(installed, parsePackageVersions(options.from), only);
  const write = !options.dryRun && !options.check;
  console.log(`portal-cli migrate — ${planned.length} migration(s) for ${installed.length} platform package(s)${write ? '' : ' (dry run)'}`);
  if (planned.length === 0) {
    console.log('✔ Nothing to migrate.');
    return;
  }
  const result = await runMigrationsInApp(root, planned, write);
  printEngineResult(result);
  if (!write) {
    for (const change of result.changes) {
      console.log(`\n${toPatch(change)}`);
    }
  }
  if (result.changes.length === 0) {
    console.log('\n✔ The app is up to date with its platform packages.');
    return;
  }
  if (options.check) {
    console.log(`\n✗ ${result.changes.length} file(s) still need migrations — run \`portal-cli migrate\` and commit.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✔ ${result.changes.length} file(s) ${write ? 'migrated' : 'would change'}.`);
};
