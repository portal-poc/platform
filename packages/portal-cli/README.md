# @portal/cli (command: `portal-cli`)

Scoped on purpose: an unrelated public package named `portal-cli` exists on npmjs (dependency confusion).

Built on **commander** (commands, flags, `--help`) + **@inquirer/prompts** (questions), the same kind of base
create-react-app / create-vite use.

```sh
portal-cli create remote <name> [--dir] [--port] [--layers entities,features,widgets] [--presets|--no-presets] [--bridge|--no-bridge] [-y]
portal-cli add <page|widget|feature|entity> <name> [--segments api,model,lib] [--dir]
portal-cli verify [--dir .] [--mode integrated|bridge]
```

- `create remote` asks which optional FSD layers to create (app, pages, shared are always created), whether to inherit
  configs from `@portal/presets` or inline them, and whether to include the bridge entry. Generated code is owned by
  the team; the template is never synced again.
- `verify` reads `dist/mf-manifest.json` + the installed `@portal/platform-contract` and checks the integration contract
  (name, exposes, singletons and ranges, react-query not a singleton, contract version; warns about secrets and
  environment-specific `config.json`). It is the only permanent consistency mechanism — run it in CI.

Generated remotes build through `@portal/vite-config` (pinned Vite + MF plugin, MF section of the contract).

The template (`templates/remote`) is `apps/tasks-remote` without its demo pages (`pages/list|create|details`,
`features/toggle-bookmark`, the tasks fake backend) — keep them in sync when changing the skeleton.
