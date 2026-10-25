# @portal-poc/cli (command: `portal-cli`)

Scoped on purpose: an unrelated public package named `portal-cli` exists on npmjs (dependency confusion).

Built on **commander** (commands, flags, `--help`) + **@inquirer/prompts** (questions), the same kind of base
create-react-app / create-vite use.

## Scaffolding and checks (developers)

```sh
portal-cli create remote <name> [--dir] [--port] [--layers entities,features,widgets] [--presets|--no-presets] [--bridge|--no-bridge] [-y]
portal-cli add <page|widget|feature|entity> <name> [--segments api,model,lib] [--dir]
portal-cli verify [--dir .] [--mode integrated|bridge]
```

- `create remote` asks which optional FSD layers to create (app, pages, shared are always created), whether to inherit
  configs from `@portal-poc/presets` or inline them, and whether to include the bridge entry. Generated code is owned by
  the team; the template is never synced again.
- `verify` reads `dist/mf-manifest.json` + the installed `@portal-poc/platform-contract` and checks the integration
  contract (name, exposes, singletons and ranges, react-query not a singleton, contract version; warns about secrets
  and environment-specific `config.json`). It is the only permanent consistency mechanism — run it in CI.

## Delivery (what the pipelines run)

The reusable workflows call `pnpm dlx @portal-poc/cli@2 …`: the CLI of the current platform, whatever ref is
deployed. Uploads need `PORTAL_NEXUS_USER` / `PORTAL_NEXUS_PASSWORD` (pipeline secrets); `--registry` is a local
clone of the registry (`PORTAL_REGISTRY_DIR`).

| Command | What |
|---|---|
| `deploy --stand <s> [--ref] [--base-path --scopes] [--push\|--pr]` | The remote's **Deploy** button. Snapshot stand: build → gate → overwrite `portal-snapshots/<s>/<name>/` → remove files of earlier builds older than a day. Release stand: `release/X.Y` → next `-rc.<run>`, `vX.Y.Z` → that version (published once, reused) → registry entry. Refusals (wrong line, tst, no route on a first deploy) happen before the build. |
| `publish [--version] [--reuse]` | Upload a build (+ `dist-bridge/`) to `portal-releases/<name>/<version>/`; immutable. |
| `release --stand <s> [--version]` | Point a release stand at a published version through the gate; rollback = an older version. |
| `promote --from dev1 --to tst` | Copy the versions that passed one stand to the stand promoted from it (no rebuild), the host included. |
| `stand switch <s> --branch release/X.Y` | Move a release stand to another line (`stands.json`). |
| `host deploy --stand <s> [--ref] [--push]` | The host's **Deploy**, same stand rules as remotes. Snapshot stand: build → reverse gate (every remote on the stand) → overwrite `portal-stands/<s>/host/` → remove old files. Release stand: `release/X.Y` → next rc, `vX.Y.Z` → that version; published once to `portal-releases/host/<version>/`, gated, `<s>/_host.json` written (the config deploy installs it). |
| `host release --stand <s> --version <v>` | Point a release stand at a published host version through the reverse gate (rollback). |
| `host sync --stand <s>` | Config deploy step: copy the host version the registry names onto the stand when it serves another one. |
| `registry check --stand <s> [--against compat.json]` | Gate 2: every entry of the stand against its host's `compat.json`. |
| `registry build --stand <s> [--out] [--upload]` | The stand's `/config.json` from the registry (Config deploy uploads it). |
| `registry status` / `registry validate` | What runs where (dev3 shows the built snapshot) / offline check of entries, `stands.json` and release lines (registry CI). |

Generated remotes build through `@portal-poc/vite-config` (pinned Vite + MF plugin, MF section of the contract).

The template (`templates/remote`) is the `tasks-remote` repository without its demo pages (`pages/list|create|details`,
`features/toggle-bookmark`, the tasks fake backend) — keep them in sync when changing the skeleton.
