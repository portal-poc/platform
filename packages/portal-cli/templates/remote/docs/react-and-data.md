# Rules for React and data in this remote

- One http client per app: the axios instance `http` in `shared/api/http.ts`, created at module level with the
  team's settings and bound to the host's login by `attachPlatformAuth` (`@portal-poc/http`): bearer token per
  request, one retry after 401, login only through the host. Import it anywhere; never call `fetch`/`axios` directly.
  `RemoteRoot` binds the platform (`remotePlatform.bind`) before anything renders. Parse every body with
  `parseResponse(schema)`.
- One QueryClient per app: `getRemoteQueryClient(platform)` (`shared/api/query-client.ts`). Never use the host's.
- Query keys come from the factory in `shared/api/query-keys.ts`: the remote's name first (`__NAME__`, readable in the
  host's devtools, where every remote's cache is listed), then the domain scope (`lists()`, `list(filters)`,
  `details()`, `detail(id)`), so one prefix invalidates a whole family. Queries are `queryOptions` factories
  (`shared/api/queries.ts`), so `setQueryData(options.queryKey, …)` is typed without `any`.
- Responses are parsed with the zod schemas in `shared/api/contracts.ts` (trust boundary).
- Changing a suspense query key (filter, page, selection) goes through `startTransition` or `useDeferredValue`.
- Mutations: the button reads `mutation.isPending`. Use a transition only when a suspending update follows.
- Create → redirect: put the response into the list cache before `navigate`, don't wait for invalidation.
  Busy flag = `mutation.isPending || navigation.state !== 'idle'`.
- Cross-app signals (e.g. something the host shows changed) go through `platform.events`, never through shared state.
- View transitions: only local ones (list items, shared elements), class names prefixed `__NAME__-`, 150–250 ms, off
  under `prefers-reduced-motion`. Put the CSS next to the component that uses it; never global rules for
  `::view-transition-*(*)` — in integrated mode they would apply to the host's route transitions too.
- Code style: no `any`, no `useMemo`/`useCallback`/`memo` (React Compiler), arrow functions, braces on every `if`.
