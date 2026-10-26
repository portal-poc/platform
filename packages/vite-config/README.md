# @portal-poc/vite-config

**The build preset for the host and every remote.** It owns the Module Federation section (name, exposes, shared,
bridge variant) and pins the build tooling; your team owns everything else in `vite.config.ts`. A build records its
version and commit, so every artifact on a stand can be traced to a commit.

```sh
pnpm add -D @portal-poc/vite-config vite @module-federation/vite
```

## Exports

| Export | Use it to |
|---|---|
| `createRemoteViteConfig({ name, port, configUrl, exposesDir?, isolated?, compiler?, extend? })` | A remote's config. `vite build` → `dist/` (integrated), `vite build --mode bridge` → `dist-bridge/` (shares nothing). `isolated: true` for an app on another React (legacy): bridge-only. |
| `createHostViteConfig({ port, configUrl, plugins?, extend? })` | The host's config: same tooling and React Compiler; remotes are registered at runtime, never statically. |
| `gitCommitOf(dir)` | The commit of a build (`-dirty` for local uncommitted builds). |

```ts
// vite.config.ts of a remote (generated)
export default createRemoteViteConfig({ name: 'tasks', port: 5174, configUrl: import.meta.url, extend: { /* yours */ } });
```

## What every build gets

- **MF section from the contract**: the four exposes, `shared` = `SINGLETONS` (mf-shared), nothing else.
- **Tooling check on config load**: Vite / MF plugin outside `SUPPORTED_BUILD_TOOLING` fails the build with a message
  (upgrade tooling with this package, not per app).
- **`PORTAL_APP_VERSION`** (from `PORTAL_APP_VERSION` env set by the deploy, else `package.json`) and the commit in
  `mf-manifest.json` → `metaData.portal` (shown by `registry status` and the host's remotes panel).
- **React Compiler** on (`compiler: false` to opt out).

Decision: [ADR 0019 — build tooling is a build-time singleton](../../docs/adr/0019-build-tooling-singleton.md).
