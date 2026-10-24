import { Argument, Command, Option } from 'commander';
import { runAddSlice, SLICE_LAYERS } from './commands/add-slice.ts';
import type { SliceLayer } from './commands/add-slice.ts';
import { OPTIONAL_LAYERS, runCreateRemote } from './commands/create-remote.ts';
import { runVerify } from './commands/verify.ts';

const program = new Command('portal-cli').description('Portal micro-frontend tooling').version('0.1.0');

const create = program.command('create').description('Generate a new application from the reference template');

create
  .command('remote')
  .description('Generate a remote (FSD 2.1, all integration-contract exposes, standalone mode)')
  .argument('<name>', 'remote name (MF name, lower-case, e.g. "reports")')
  .option('--dir <path>', 'target directory (default: ./<name>-remote)')
  .option('--port <port>', 'dev server port', '5176')
  .option('--layers <list>', `optional FSD layers, comma-separated: ${OPTIONAL_LAYERS.join(', ')}`)
  .option('--presets', 'inherit internal configs from @portal/presets')
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

try {
  await program.parseAsync();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
