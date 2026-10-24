# ADR 0007: Transitions and mutations

## Context

Suspense queries have no `placeholderData`; mutations followed by navigation flicker.

## Decision

Key changes go through `startTransition`/`useDeferredValue`. Buttons use `mutation.isPending`; return the invalidation promise from `onSuccess` to wait for refetch. Create → redirect: `setQueryData` into the list before navigating, don't await invalidation; busy flag = `mutation.isPending || navigation.state !== 'idle'` (router `useTransitions` keeps navigation state optimistic while the target suspends).

## Consequences

Updates after `await` inside async transitions need `startTransition` again; errors thrown in transitions reach error boundaries — show them via `mutation.error`.
