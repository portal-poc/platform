# Rules for React and data in this remote

- One QueryClient per app: `getRemoteQueryClient(platform)` (`shared/api/query-client.ts`). Never use the host's.
- Query keys start with `__NAME__`, then the domain scope. Keys come only from `queryOptions` factories
  (`shared/api/__NAME__-queries.ts`), so `setQueryData(options.queryKey, …)` is typed without `any`.
- Changing a suspense query key (filter, page, selection) goes through `startTransition` or `useDeferredValue`.
- Mutations: the button reads `mutation.isPending`. Use a transition only when a suspending update follows.
- Create → redirect: put the response into the list cache before `navigate`, don't wait for invalidation.
  Busy flag = `mutation.isPending || navigation.state !== 'idle'`.
- View transitions: only local ones (list items, shared elements prefixed `__NAME__-`). The host owns route-level transitions.
- After a bookmark mutation, emit `bookmarks.changed` on `platform.events` so the host widget refreshes.
- Code style: no `any`, no `useMemo`/`useCallback`/`memo` (React Compiler), arrow functions, braces on every `if`.
