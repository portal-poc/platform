# Portal reference monorepo

Reference implementation of the Portal micro-frontend platform. Requirements: [`PORTAL_MFE_CONTEXT.md`](./PORTAL_MFE_CONTEXT.md).
Overview: [`docs/architecture.md`](./docs/architecture.md). Demo scenarios: [`docs/demo.md`](./docs/demo.md).

## Quick start

```sh
volta install node@24.19.0 pnpm@12.15.0   # or use .nvmrc + corepack where Volta is unavailable
pnpm install
pnpm build          # remotes must be built once for `preview`; `dev` works without it
pnpm dev            # infra + local stand: tasks-remote, legacy-remote, host (dev servers)
open http://localhost:5173
```

Release flow on a production-like stand (Nexus, registry, gates): see [`docs/delivery.md`](./docs/delivery.md).
Migration from the current project: [`docs/migration-plan.md`](./docs/migration-plan.md).

Checks (run after every phase): `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm verify`.
