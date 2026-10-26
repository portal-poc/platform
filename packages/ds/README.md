# @portal-poc/ds

**The design system: one look for the whole portal.** An **MF singleton** — the host loads it once and every
integrated remote uses that copy (theme context must be the same object). Built on MUI Joy; apps import UI only from
here, never from `@mui/joy` directly, so the DS can change its base without touching apps.

```sh
pnpm add @portal-poc/ds   # peers: react 19, @emotion/react, @emotion/styled, @mui/joy (all MF singletons)
```

## Portal components

| Export | Use it for |
|---|---|
| `DsProvider` | Theme + CSS baseline. Rendered once by the host; by a remote only in standalone / bridge mode (its own React root). |
| `portalTheme` | The Joy theme on CSS variables (`--joy-*`): consistency rests on tokens, not only on the DS major. |
| `AsyncBoundary` | ErrorBoundary + Suspense with the portal spinner and a retry error by default. Wrap every data region and every remote. |
| `SpinnerFallback`, `Spinner` | The portal loader: the host (loading a remote) and remotes (loading data) look like one. |
| `AsyncButton` | Submit buttons: disabled at once (no double submit), spinner only after 300 ms, width never jumps. |
| `PendingRegion` | A region that is refreshing: overlay after 2 s, driven by one `data-pending` attribute (thresholds are CSS variables). |
| `useLoadingStage(isPending)` → `'idle' \| 'button' \| 'blocking'` | The same stages in JS when logic or text depends on them. Prefer the CSS primitives for visuals. |
| `Alert` | Alert with a `title` prop (mirrors the real project's DS). |

## Joy re-exports

`Box`, `Button`, `Card`, `Checkbox`, `Chip`, `DialogActions`, `DialogContent`, `DialogTitle`, `FormControl`,
`FormHelperText`, `FormLabel`, `IconButton`, `Input`, `Link`, `List`, `ListItem`, `Modal`, `ModalDialog`, `Option`,
`Select`, `Sheet`, `Snackbar`, `Stack`, `Tab`, `TabList`, `Tabs`, `Typography`, `GlobalStyles`. Need another Joy
component? Add the re-export here (minor release) rather than importing Joy in an app.

## Rules

- The host provides one DS version per stand (`SINGLETONS['@portal-poc/ds']` in mf-shared). A remote built against an
  incompatible major is loaded as its bridge build (own copy) instead of breaking — upgrade within the range.
- ESM only, no CommonJS dependencies (shared modules are not pre-bundled in consuming apps).
- Loading UX rules: [ADR 0006 — loading pattern](../../docs/adr/0006-loading-pattern.md),
  [0015 — AsyncBoundary does not depend on TanStack Query](../../docs/adr/0015-async-boundary-without-react-query.md).
