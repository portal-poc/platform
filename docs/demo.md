# Demo scenarios (acceptance criteria)

Start everything: `pnpm install && pnpm dev`, open http://localhost:5173 (local stand: dev servers). Release and
stand scenarios (new version, rollback, gates, bridge fallback, dev overrides) are in [`delivery.md`](./delivery.md). The **Demo panel** (bottom-left) switches
account, fake-BFF delay, token TTL, forced bridge mode and an incompatible contract. The **Devtools** button
(bottom-right) is the query devtools toolbar. Out of scope (see `architecture.md`): realtime scenarios 6–9,
API-contract scenario 17, preload demo 18.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Button stages | Tasks → New task. Delay 100 ms → Create. Repeat with 800 ms and 3000 ms. | Button disabled immediately; no spinner at 100 ms; spinner after 300 ms at 800 ms; region overlay after 2 s at 3000 ms. |
| 2 | Deferred Suspense fallback | Reload `/tasks` with delay 100 ms, then 800 ms. | No spinner for fast loads; spinner fades in otherwise. Host fallback (remote loading) and remote fallback (data) look identical (DS `Spinner`). |
| 3 | Filter without fallback | Delay 800 ms, change the status filter. | Old list stays; `PendingRegion` shows pending by thresholds. |
| 4 | Create → redirect | (a) Open the list, then create a task. (b) Reload directly on `/tasks/new`, create. | (a) List shows the new task instantly, no spinner. (b) Button stays busy until the list is ready (optimistic navigation state). |
| 5 | List animation | Tasks → "Simulate colleague's task". Then enable reduced motion in the OS and repeat. | New row appears with a view transition (`useDeferredValue` + `ViewTransition`); no animation under reduced motion. |
| 6' | Bookmarks across apps (local bus) | Tasks → ☆ on a task → Home. | Host widget shows the bookmark (event `bookmarks.changed` on `platform.events`); link opens the task in the remote. |
| 10 | Account change | Demo panel → switch Alice ↔ Bob / Signed out. | Host and remote caches reset and reload under the new account; signed out shows the sign-in screen. |
| 11 | Scope allowlist | Tasks → "Request foreign scope". | Clear error in the page, in the console telemetry and in the demo panel. |
| 12 | Devtools | Home: open devtools (host). Go to Tasks (auto-switch to tasks). Back to Home (tasks listed as "○ loaded"). Pin tasks, reload. | Auto-selection, loaded state, pin survives reload; unloaded remotes are not listed. On stands: `?devtools=1`. |
| 13 | Standalone | `pnpm --filter tasks-remote dev:standalone` | Same `RemoteRoot` with its own mock auth, router and devtools toolbar. |
| 14 | Integration modes | Tasks (integrated). Legacy (React 18 → bridge automatically). Demo panel → force bridge build for tasks (needs a published bridge build, e.g. on uat). | Integrated: host navigation shows the pending spinner while the remote loads (shared transition). Bridge: own root, own fallback, own router with basename; `navigateToHost` returns to the host. |
| 15 | Incompatible contract | Demo panel → "Simulate incompatible contract", open Tasks. | Clear error with Retry inside `AsyncBoundary`; the host keeps working. |
| 16 | verify | `pnpm --filter tasks-remote build && pnpm --filter tasks-remote verify`; then remove `./preload` from its vite config (or make `@tanstack/react-query` a singleton) and repeat. | Passes; then fails with a readable report (also covered by `portal-cli` unit tests). |

Directional route transitions: Home → Tasks slides forward, Tasks → Home slides back (types `nav-forward`/`nav-back`).
Performance Tracks in Chrome DevTools show key changes as transitions, not blocking updates.
