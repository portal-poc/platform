import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { QueryClientConfig } from '@tanstack/react-query';
import type { PlatformTelemetry } from '@portal-poc/platform-contract';
import { PlatformInteractionRequiredError, PlatformScopeNotAllowedError } from '../auth/errors';
import { HttpError, ResponseValidationError } from '../http/errors';

const MAX_RETRIES = 2;

const isTransientStatus = (status: number): boolean => status >= 500 || status === 429;

/** Do not retry 4xx (401/403/404…) and validation errors; retry network errors, 5xx and 429 up to 2 times. */
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= MAX_RETRIES) {
    return false;
  }
  if (
    error instanceof ResponseValidationError ||
    error instanceof PlatformInteractionRequiredError ||
    error instanceof PlatformScopeNotAllowedError
  ) {
    return false;
  }
  if (error instanceof HttpError) {
    return isTransientStatus(error.status);
  }
  // `fetch` rejects with TypeError on network failures.
  return error instanceof TypeError;
};

type PortalQueryClientOptions = {
  telemetry?: PlatformTelemetry;
  /** Overrides for the defaults below (shallow-merged per section). */
  config?: QueryClientConfig;
};

/**
 * Factory (never an instance) with portal-wide defaults. Every application owns its QueryClient.
 * `refetchOnWindowFocus` stays on as a safety net for missed realtime events.
 */
export const createPortalQueryClient = (options: PortalQueryClientOptions = {}): QueryClient => {
  const { telemetry, config = {} } = options;

  const logQueryError = (error: unknown, query: { queryKey: readonly unknown[] }) => {
    telemetry?.logError(error, { source: 'query', queryKey: query.queryKey });
  };
  const logMutationError = (error: unknown) => {
    telemetry?.logError(error, { source: 'mutation' });
  };

  return new QueryClient({
    ...config,
    queryCache: config.queryCache ?? new QueryCache({ onError: logQueryError }),
    mutationCache: config.mutationCache ?? new MutationCache({ onError: logMutationError }),
    defaultOptions: {
      ...config.defaultOptions,
      queries: {
        staleTime: 30_000,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: true,
        ...config.defaultOptions?.queries,
      },
      mutations: {
        retry: false,
        ...config.defaultOptions?.mutations,
      },
    },
  });
};
