import { describe, expect, it, vi } from 'vitest';
import { PlatformScopeNotAllowedError } from '../auth/errors';
import { createPortalQueryClient, shouldRetryQuery } from './create-portal-query-client';

/** What axios rejects with (shape only: the runtime does not depend on axios). */
const axiosError = (status?: number, code?: string) =>
  Object.assign(new Error('Request failed'), { isAxiosError: true, code, ...(status ? { response: { status } } : {}) });

describe('shouldRetryQuery', () => {
  it.each([401, 403, 404, 400])('does not retry HTTP %i', (status) => {
    expect(shouldRetryQuery(0, axiosError(status))).toBe(false);
  });

  it('retries 5xx, 429 and network errors up to 2 times', () => {
    expect(shouldRetryQuery(0, axiosError(503))).toBe(true);
    expect(shouldRetryQuery(0, axiosError(429))).toBe(true);
    expect(shouldRetryQuery(1, axiosError(undefined, 'ERR_NETWORK'))).toBe(true);
    expect(shouldRetryQuery(2, axiosError(503))).toBe(false);
  });

  it('does not retry cancellations, validation, interaction and scope errors', () => {
    expect(shouldRetryQuery(0, axiosError(undefined, 'ERR_CANCELED'))).toBe(false);
    const validation = Object.assign(new Error('bad body'), { name: 'ResponseValidationError' });
    expect(shouldRetryQuery(0, validation)).toBe(false);
    expect(shouldRetryQuery(0, new PlatformScopeNotAllowedError('tasks', ['x'], []))).toBe(false);
  });
});

describe('createPortalQueryClient', () => {
  it('reports query errors to telemetry and applies defaults', async () => {
    const telemetry = { logError: vi.fn(), trackEvent: vi.fn() };
    const client = createPortalQueryClient({ telemetry });

    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
    await client
      .fetchQuery({ queryKey: ['tasks', 'boom'], queryFn: () => Promise.reject(axiosError(404)), retry: false })
      .catch(() => undefined);
    expect(telemetry.logError).toHaveBeenCalledWith(expect.any(Error), {
      source: 'query',
      queryKey: ['tasks', 'boom'],
    });
  });

  it('returns a new instance per call (factory, not a singleton)', () => {
    expect(createPortalQueryClient()).not.toBe(createPortalQueryClient());
  });
});
