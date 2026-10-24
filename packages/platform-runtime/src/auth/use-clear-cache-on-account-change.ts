import { useEffect, useEffectEvent } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { PlatformAuthEvent, PlatformContract } from '@portal/platform-contract';

/**
 * Drops every cached query and mutation and reloads what is on screen.
 *
 * Why not a bare `queryClient.clear()`: mounted observers keep a reference to the removed query and do not refetch
 * until something re-renders them. Resetting active queries clears their data AND refetches them (suspense queries
 * suspend again), removing inactive ones frees the rest. The observable result is the same as `clear()` + reload.
 */
export const clearQueryClientForAccountChange = (queryClient: QueryClient): void => {
  void queryClient.cancelQueries();
  queryClient.getMutationCache().clear();
  queryClient.removeQueries({ type: 'inactive' });
  void queryClient.resetQueries({ type: 'active' });
};

const shouldClear = (event: PlatformAuthEvent): boolean =>
  event.type === 'logout' || event.type === 'account-changed';

/** On logout / account change, clears the application's own QueryClient (each app owns one). */
export const useClearCacheOnAccountChange = (
  platform: PlatformContract,
  getQueryClient: () => QueryClient,
): void => {
  const handleAuthEvent = useEffectEvent((event: PlatformAuthEvent) => {
    if (shouldClear(event)) {
      clearQueryClientForAccountChange(getQueryClient());
    }
  });

  useEffect(() => platform.auth.subscribe(handleAuthEvent), [platform.auth]);
};
