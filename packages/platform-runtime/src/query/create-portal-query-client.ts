import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { QueryClientConfig } from '@tanstack/react-query';
import type { PlatformTelemetry } from '@portal-poc/platform-contract';

const MAX_RETRIES = 2;

const isTransientStatus = (status: number): boolean => status >= 500 || status === 429;

/**
 * Errors are recognised by shape and name, not `instanceof`: they come from axios and from other copies of the
 * platform code (the host's auth, the app's @portal-poc/http), each bundled separately.
 */
const NEVER_RETRIED = new Set(['ResponseValidationError', 'PlatformInteractionRequiredError', 'PlatformScopeNotAllowedError']);

type AxiosLikeError = { isAxiosError: true; code?: string; response?: { status: number } };

const isAxiosLikeError = (error: unknown): error is AxiosLikeError =>
  typeof error === 'object' && error !== null && (error as { isAxiosError?: unknown }).isAxiosError === true;

/** Do not retry 4xx (401/403/404…), cancellations and validation errors; retry network errors, 5xx and 429 up to 2 times. */
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= MAX_RETRIES || (error instanceof Error && NEVER_RETRIED.has(error.name))) {
    return false;
  }
  if (!isAxiosLikeError(error) || error.code === 'ERR_CANCELED') {
    return false;
  }
  // No response = the request never got an answer (network, timeout).
  return error.response ? isTransientStatus(error.response.status) : true;
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
