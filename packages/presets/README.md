# @portal-poc/presets

**Quality gates as a dependency, not as copies.** TypeScript, oxlint, fallow, Steiger and Vitest configs that apps
and platform packages extend. Changing a rule for everyone is a version bump here; an app can override anything in
its own config (or inline the presets at `portal-cli create remote --no-presets`).

```sh
pnpm add -D @portal-poc/presets oxlint fallow steiger @feature-sliced/steiger-plugin vitest typescript
```

## What's inside

| Path | Extend it from | What it gives |
|---|---|---|
| `tsconfig/base.json` | — | Strict TS (ES2023, bundler resolution) for everything. |
| `tsconfig/react-app.json` | app `tsconfig.json` | React app (host, remotes): DOM, JSX, `vite/client` types. |
| `tsconfig/react-library.json` | platform React packages | DOM + JSX without Vite types. |
| `tsconfig/node.json` | CLI, Node tools | NodeNext, `.ts` imports. |
| `tsconfig/build-config.json` | `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts` (Node types). |
| `oxlint/base.json` | `.oxlintrc.json` | Correctness + unicorn style. |
| `oxlint/react.json` | apps' `.oxlintrc.json` | React Compiler rules (purity, refs, set-state-in-render…), no `useMemo` / `useCallback` / `memo` (the compiler memoizes), no `useBlocker` / `unstable_usePrompt` (use `useLeaveGuard`). |
| `fallow/remote.json`, `fallow/host.json`, `fallow/library.json` | `.fallowrc.json` (`"extends": "npm:@portal-poc/presets/fallow/remote.json"`) | Dead code: unused files / exports / dependencies, duplicates. Library preset ignores `migration-fixtures/`. |
| `@portal-poc/presets/steiger` → `createSteigerConfig()` | `steiger.config.ts` | FSD 2.1 "pages first"; `app/exposes` and `app/standalone` are MF entries, not slices. |
| `@portal-poc/presets/vitest` → `createVitestConfig({ environment?, setupFiles? })` | `vitest.config.ts` | `src/**` + `test/**` tests, mocks restored, `PORTAL_APP_VERSION` defined. |

Decision: [ADR 0016 — lint stack: oxlint + Steiger + fallow](../../docs/adr/0016-lint-stack.md),
[0013 — FSD 2.1](../../docs/adr/0013-fsd.md).
