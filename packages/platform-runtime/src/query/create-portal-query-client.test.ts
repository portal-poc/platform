import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { PlatformScopeNotAllowedError } from '../auth/errors';
import { HttpError, ResponseValidationError } from '../http/errors';
import { createPortalQueryClient, shouldRetryQuery } from './create-portal-query-client';

const httpError = (status: number) => new HttpError({ status, body: undefined, method: 'GET', url: '/x' });

describe('shouldRetryQuery', () => {
  it.each([401, 403, 404, 400])('does not retry HTTP %i', (status) => {
    expect(shouldRetryQuery(0, httpError(status))).toBe(false);
  });

  it('retries 5xx and network errors up to 2 times', () => {
    expect(shouldRetryQuery(0, httpError(503))).toBe(true);
    expect(shouldRetryQuery(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetryQuery(2, httpError(503))).toBe(false);
  });

  it('does not retry validation and scope errors', () => {
    const issues = z.string().safeParse(1).error?.issues ?? [];
    expect(shouldRetryQuery(0, new ResponseValidationError({ issues, method: 'GET', url: '/x' }))).toBe(false);
    expect(shouldRetryQuery(0, new PlatformScopeNotAllowedError('tasks', ['x'], []))).toBe(false);
  });
});

describe('createPortalQueryClient', () => {
  it('reports query errors to telemetry and applies defaults', async () => {
    const telemetry = { logError: vi.fn(), trackEvent: vi.fn() };
    const client = createPortalQueryClient({ telemetry });

    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
    await client
      .fetchQuery({ queryKey: ['tasks', 'boom'], queryFn: () => Promise.reject(httpError(404)), retry: false })
      .catch(() => undefined);
    expect(telemetry.logError).toHaveBeenCalledWith(expect.any(HttpError), {
      source: 'query',
      queryKey: ['tasks', 'boom'],
    });
  });

  it('returns a new instance per call (factory, not a singleton)', () => {
    expect(createPortalQueryClient()).not.toBe(createPortalQueryClient());
  });
});
