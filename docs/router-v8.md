# React Router v8 (instead of v7)

The requirements targeted v7; the project owner chose the current major (8.5). Relevant differences:

- `react-router-dom` is removed: `RouterProvider` comes from `react-router/dom`, everything else from `react-router`.
  `react-router/dom` must be an MF singleton as well (it carries router internals).
- ESM only, Node ≥ 22.22, React ≥ 19.2.7.
- Router-level view transitions (`viewTransition` prop/option, `useViewTransitionState`) are **deprecated in 8.5** in
  favour of React's `<ViewTransition>` — exactly the approach of ADR 0008. Navigation updates already run in
  `startTransition`; keep `useTransitions` on. `useTransitions` also makes `useNavigation()` optimistic while a target
  suspends (used for the busy flag in create → redirect).
- Middleware is always on (no `future.v8_middleware`) — not used here.
- `@module-federation/bridge-react` router entries support React Router ≤ 7: the host uses the router-agnostic
  `bridge-react/base` and passes `basename` explicitly; bridge remotes bring their own router (legacy uses v7).
