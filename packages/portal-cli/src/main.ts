#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Argument, Command, Option } from 'commander';
import { runAddSlice, SLICE_LAYERS } from './commands/add-slice.ts';
import type { SliceLayer } from './commands/add-slice.ts';
import { OPTIONAL_LAYERS, runCreateRemote } from './commands/create-remote.ts';
import { runRegistryBuild, runRegistryCheck, runRegistryStatus, runRegistryValidate } from './commands/registry.ts';
import { runPromote, runStandSwitch } from './commands/promote.ts';
import { runPublish, runRelease } from './commands/release.ts';
import { runVerify } from './commands/verify.ts';

// Positional options: `--version` of a subcommand (publish/release) is not the program's --version.
// src/main.ts and dist/main.js are both one level below the package root.
const { version }: { version: string } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const program = new Command('portal-cli').description('Portal micro-frontend tooling').version(version).enablePositionalOptions();

const create = program.command('create').description('Generate a new application from the reference template');

create
  .command('remote')
  .description('Generate a remote (FSD 2.1, all integration-contract exposes, standalone mode)')
  .argument('<name>', 'remote name (MF name, lower-case, e.g. "reports")')
  .option('--dir <path>', 'target directory (default: ./<name>-remote)')
  .option('--port <port>', 'dev server port', '5176')
  .option('--layers <list>', `optional FSD layers, comma-separated: ${OPTIONAL_LAYERS.join(', ')}`)
  .option('--presets', 'inherit internal configs from @portal-poc/presets')
  .option('--no-presets', 'inline internal configs into the project')
  .option('--bridge', 'include the bridge (isolated mode) entry')
  .option('--no-bridge', 'generate a stub bridge entry')
  .option('-y, --yes', 'accept defaults for every question')
  .action(runCreateRemote);

program
  .command('add')
  .description('Add an FSD slice with segments and a public index.ts')
  .addArgument(new Argument('<layer>', 'layer').choices(Object.keys(SLICE_LAYERS)))
  .argument('<name>', 'slice name (kebab-case)')
  .option('--segments <list>', 'extra segments besides ui, comma-separated (api, model, lib)')
  .option('--dir <path>', 'remote root', '.')
  .action((layer: SliceLayer, name: string, options: { segments?: string; dir?: string }) => {
    runAddSlice(layer, name, options);
  });

program
  .command('verify')
  .description('Check the built remote against the integration contract (run in CI after build)')
  .option('--dir <path>', 'remote root', '.')
  .option('--dist <dir>', 'build output to check (e.g. dist-bridge)', 'dist')
  .option('--against <compat>', "target host deployment's compat.json (URL or path) — exact version check")
  .addOption(new Option('--mode <mode>', 'integration mode the remote targets').choices(['integrated', 'bridge']).default('integrated'))
  .action(runVerify);

program
  .command('publish')
  .description('Upload the build (and the bridge variant) as an immutable versioned artifact')
  .addOption(
    new Option('--nexus-dir <path>', 'artifact repository (PoC: a folder; real: Nexus raw repository)')
      .env('PORTAL_NEXUS_DIR')
      .makeOptionMandatory(),
  )
  .option('--dir <path>', 'remote root', '.')
  .option('--version <version>', 'artifact version (default: PORTAL_APP_VERSION, else package.json)')
  .action(runPublish);

program
  .command('release')
  .description('Point a stand at a published version through the compatibility gate (writes the registry entry = PR)')
  .option('--stand <stand>', 'target stand (manual release or rollback)')
  .option('--auto', "the stands tracking this version's branch (X.Y.Z-dev.N → develop, X.Y.Z → release/X.Y) — CI")
  .addOption(new Option('--registry <path>', 'local clone of the registry repository').env('PORTAL_REGISTRY_DIR').makeOptionMandatory())
  .option('--dir <path>', 'remote root', '.')
  .option('--version <version>', 'published version (default: PORTAL_APP_VERSION, else package.json; older = rollback)')
  .option('--base-path <path>', 'route in the host (first release only)')
  .option('--scopes <list>', 'token scopes allowlist (first release only)')
  .addOption(new Option('--mode <mode>', 'integration mode').choices(['integrated', 'bridge']).default('integrated'))
  .option('--pr', 'commit the entry on a release branch of the registry clone, push it and open a pull request (gh)')
  .action(runRelease);

program
  .command('promote')
  .description('Copy the versions that passed one stand to the stand promoted from it (same artifacts, no rebuild)')
  .requiredOption('--from <stand>', 'source stand (e.g. dev1)')
  .requiredOption('--to <stand>', 'target stand with promoteFrom = source (e.g. tst)')
  .option('--remote <name>', 'only this remote (default: all)')
  .addOption(new Option('--registry <path>', 'local clone of the registry repository').env('PORTAL_REGISTRY_DIR').default('.'))
  .option('--pr', 'open the registry pull request (gh)')
  .action(runPromote);

const stand = program.command('stand').description('Stand ↔ branch mapping (registry stands.json)');

stand
  .command('switch')
  .description('Move a stand to another release line: mapping + that line\'s current versions in one PR')
  .argument('<stand>', 'stand to switch (e.g. dev1)')
  .requiredOption('--branch <branch>', 'release/X.Y the stand follows from now on')
  .option('--from <stand>', 'stand that runs that line now (default: the one tracking it, else latest-release)')
  .addOption(new Option('--registry <path>', 'local clone of the registry repository').env('PORTAL_REGISTRY_DIR').default('.'))
  .option('--pr', 'open the registry pull request (gh)')
  .action(runStandSwitch);

const registry = program.command('registry').description('Remote registry: which version runs on which stand');

registry
  .command('check')
  .description('Host deploy gate: verify every registered remote against a host compat.json')
  .requiredOption('--stand <stand>', 'stand')
  .addOption(new Option('--registry <path>', 'local clone of the registry repository').env('PORTAL_REGISTRY_DIR').makeOptionMandatory())
  .option('--against <compat>', "host compat.json (default: the stand's deployed host)")
  .action(runRegistryCheck);

registry
  .command('validate')
  .description('Offline check of every entry (shape, stands, URLs) — CI of the registry repository')
  .addOption(new Option('--registry <path>', 'registry checkout').env('PORTAL_REGISTRY_DIR').default('.'))
  .action(runRegistryValidate);

registry
  .command('build')
  .description("Config deploy job: aggregate the stand's entries into the host /config.json")
  .requiredOption('--stand <stand>', 'stand')
  .addOption(new Option('--registry <path>', 'local clone of the registry repository').env('PORTAL_REGISTRY_DIR').makeOptionMandatory())
  .requiredOption('--out <file>', 'output file')
  .action(runRegistryBuild);

registry
  .command('status')
  .description('Versions dashboard: remote × stand × required singletons')
  .addOption(new Option('--registry <path>', 'local clone of the registry repository').env('PORTAL_REGISTRY_DIR').makeOptionMandatory())
  .option('--stands <list>', 'stands to show (default: all in stands.json)')
  .action(runRegistryStatus);

try {
  await program.parseAsync();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
