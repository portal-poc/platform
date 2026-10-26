# PoC vs. the real project

What the PoC simplifies or does differently — so nobody mistakes a shortcut for a recommendation. The "real
project" column only states what the team has described; **target** marks what the PoC proposes, and "not known"
means it still has to be checked against the real setup.

## What the PoC fakes or simplifies

| Area | PoC | Real project |
|---|---|---|
| Repositories and CI | GitHub organisation `portal-poc`; reusable GitHub workflows pinned by tag | Azure DevOps. **Target:** the same central pipelines as Azure DevOps templates |
| Packages | GitHub Packages, scope `@portal-poc` | Platform code is copied, not published. **Target:** an internal npm scope (e.g. in Nexus), never proxied from npmjs |
| Infrastructure | One small VPS: Nexus CE + nginx stands at `*.poc.ashirokov.dev` (ADR 0021) | Remote builds are uploaded to Nexus; the rest of the hosting is not known |
| Registry writes from CI | A deploy key with write access | No registry today. **Target:** a service account / app identity for the pipeline |
| Auth | Mock auth by default (accounts in the demo panel); the MSAL adapter is implemented (`@portal-poc/platform-runtime/msal`) | MSAL in the host; an impersonation header next to the bearer token (not in the PoC yet, ADR 0022) |
| Backends | No BFFs: each app puts a fake `fetch` behind its real axios client (tokens, headers, zod run as in production); tasks and bookmarks live in `localStorage` | One BFF per remote, plus the host's BFF |
| API types | Hand-written zod schemas per app | Not known what is used today; the backend has talked about a shared OpenAPI specs repository |
| E2E tests | None yet | Not known |

## Where the real project differs today (the problems the PoC answers)

| Area | Real project today | PoC / target |
|---|---|---|
| Remote configuration | The host holds every remote's env settings (BFF base URLs, asset URLs) and passes them through `window.env` | Each remote's own `public/config.json` per environment; the host knows only manifest URL, route and scopes from the registry; assets resolve from the manifest (migration phase 5 / A3) |
| QueryClient | One QueryClient shared by the host and the remotes | One per app; the shared client and its key-prefix rules are removed (ADR 0004) |
| Realtime | Pub/sub lives in the host and reaches remotes through `window`; global subscriptions | Each app's own socket to its BFF (`@portal-poc/realtime`, ADR 0026, phase A4) |
| Legacy app | A precedent: onboarding a legacy app meant adapting both sides — the portal to the legacy app (including its separate auth) and the legacy app to the portal | `legacy-remote`: its own React 18 + router in an MF bridge, the host's token exchanged by its BFF (ADR 0027, phase A6) — neither side changes much |

The full list of today's problems and how each one is answered: [migration-plan.md](migration-plan.md).

## Same in both

- Four stands, no prod: the same number as the PoC's dev3 / dev2 / dev1 / tst.
- TypeScript with `strict: true`.
- React 19 with React Compiler, TanStack Query v5, React Hook Form + zod, MUI Joy behind a design-system wrapper,
  oxlint, Vitest, pnpm, Vite + Module Federation.

The PoC uses React Router **v8**; check the version the real apps run before reusing router-specific code (ADR on
the v7 → v8 differences: [router-v8.md](router-v8.md)).
