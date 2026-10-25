# ADR 0024: Leave guards and page titles go through the platform

## Context

Remotes need to keep the user on a page (a dirty form, a mutation in flight) and to name their pages in the browser
tab. Both cross app boundaries: a remote's breadcrumb links to the host's home page, the host's menu leaves the
remote, a bridge remote (its own router, React 18 for legacy) sits under the host's menu. React Router supports one
blocker per router, and integrated remotes render their routes inside the host's router: a remote calling
`useBlocker` would break the host's blocker or another app's. The document title is one per page, and React 19's
`<title>` neither composes nor exists in React 18.

## Decision

- **Contract 1.2** (optional members, `PLATFORM_CONTRACT_VERSION` stays 1):
  - `navigation.guard({ message, allows?, lock?, confirm? })` → release; `isBlocked(pathname)`;
    `confirmLeave(pathname)` → `Promise<boolean>`. Full browser paths.
  - `document.setTitle(title | null)`.
- **One registry per page** (`createLeaveGuards`, runtime): the host's (standalone: its own). On a navigation that
  leaves: a `lock` guard refuses it (the host shows a notice); otherwise every blocking guard is asked in turn — its
  own `confirm` (the app's dialog, may save first) or the host's dialog. While any guard exists, `beforeunload` makes
  the browser ask on reload / tab close (no custom dialog or lock is possible there). Concurrent decisions for the
  same target are shared: back/forward reaches the host's router and a bridge app's router at once.
- **One blocker per router**: `PlatformLeaveBlocker` (`@portal-poc/platform-runtime/router`) is the only
  `useBlocker`. The host renders it in its layout; generated bridge and standalone entries render it inside their
  own routers. `useBlocker` / `unstable_usePrompt` from `react-router` are lint errors in apps (presets).
- **Apps** use `useLeaveGuard(when, { message, allows, lock, dialog: 'own' })` → `{ state, pathname, leave, stay,
  release }` and `usePageTitle(title)`, identical in every mode. `release()` drops a guard before a navigation the
  app starts itself after saving. React 18 apps without the runtime call the contract directly (legacy: ~30 lines).
- **Titles**: the host keeps one title per app and shows the one of the section on screen:
  `<page> · <section> · Portal`, the section title when the app set none.

## Consequences

- A dirty form in any app holds every way out: the host's menu, breadcrumbs to the host, in-app links, back/forward,
  `navigateToHost`, reload. One dialog look for the portal, or the app's own dialog where it needs more buttons.
- On a host older than contract 1.2 the hooks degrade: no title, and the guard only adds `beforeunload`.
- A bridge app shares the browser history with the host: when the host refuses a back navigation, React Router
  restores the entry and a BrowserRouter-based app may briefly render the previous URL.
- Remotes generated before cli 2.6 add `<PlatformLeaveBlocker>` to their bridge and standalone entries (template
  README).
