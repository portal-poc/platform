import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { z } from 'zod';
import type { PlatformAuth } from '@portal/platform-contract';
import { PlatformInteractionRequiredError } from '../auth/errors';
import { createHttpClient } from './create-http-client';
import { HttpError, ResponseValidationError } from './errors';

const taskSchema = z.object({ id: z.string(), title: z.string() });

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const createAuth = (tokens: string[] = ['t1', 't2', 't3']): PlatformAuth => {
  let index = 0;
  const nextToken = async () => {
    const token = tokens[Math.min(index, tokens.length - 1)] ?? 'token';
    index += 1;
    return token;
  };
  return {
    getAccessToken: vi.fn(nextToken),
    getAccount: () => null,
    subscribe: () => () => {},
    requestInteraction: vi.fn(async () => {}),
  };
};

const getHeader = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

const initOf = (fetchMock: Mock<typeof fetch>, call: number): RequestInit | undefined => fetchMock.mock.calls[call]?.[1];

const urlOf = (fetchMock: Mock<typeof fetch>, call: number): string => String(fetchMock.mock.calls[call]?.[0]);

describe('createHttpClient', () => {
  it('adds the bearer token and validates the response with zod', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: '1', title: 'A' }));
    const http = createHttpClient({ baseUrl: 'http://bff/api/', scopes: ['s'], auth: createAuth(), fetch: fetchMock });

    const task = await http.get('/tasks/1', taskSchema, { query: { expand: true, skip: undefined } });

    expect(task).toEqual({ id: '1', title: 'A' });
    expect(urlOf(fetchMock, 0)).toBe('http://bff/api/tasks/1?expand=true');
    expect(getHeader(initOf(fetchMock, 0), 'Authorization')).toBe('Bearer t1');
    expect(getHeader(initOf(fetchMock, 0), 'X-Correlation-Id')).toBeNull();
  });

  it('sends X-Client-Version when configured', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: '1', title: 'A' }));
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth: createAuth(), clientVersion: 'tasks@1.4.2', fetch: fetchMock });

    await http.get('/tasks/1', taskSchema);

    expect(getHeader(initOf(fetchMock, 0), 'X-Client-Version')).toBe('tasks@1.4.2');
  });

  it('generates X-Correlation-Id for mutations and keeps a provided one', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: '1', title: 'A' }, 201));
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth: createAuth(), fetch: fetchMock });

    await http.post('/tasks', taskSchema, { body: { title: 'A' } });
    await http.post('/tasks', taskSchema, { body: { title: 'A' }, correlationId: 'corr-1' });

    const firstInit = initOf(fetchMock, 0);
    const secondInit = initOf(fetchMock, 1);
    expect(getHeader(firstInit, 'X-Correlation-Id')).toMatch(/[0-9a-f-]{36}/);
    expect(getHeader(secondInit, 'X-Correlation-Id')).toBe('corr-1');
    expect(getHeader(secondInit, 'Content-Type')).toBe('application/json');
  });

  it('retries once after 401 with a force-refreshed token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: '1', title: 'A' }));
    const auth = createAuth();
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth, fetch: fetchMock });

    await expect(http.get('/tasks/1', taskSchema)).resolves.toEqual({ id: '1', title: 'A' });
    expect(auth.getAccessToken).toHaveBeenLastCalledWith(['s'], { forceRefresh: true });
    expect(getHeader(initOf(fetchMock, 1), 'Authorization')).toBe('Bearer t2');
  });

  it('asks the host for interaction when the second 401 requires it', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: 'denied' }, 401, { 'www-authenticate': 'Bearer error="interaction_required"' }),
    );
    const auth = createAuth();
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth, fetch: fetchMock });

    await expect(http.get('/tasks/1', taskSchema)).rejects.toBeInstanceOf(HttpError);
    expect(auth.requestInteraction).toHaveBeenCalledWith(['s']);
  });

  it('asks the host for interaction when the token cannot be refreshed silently', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}, 401));
    const auth = createAuth();
    vi.mocked(auth.getAccessToken)
      .mockResolvedValueOnce('t1')
      .mockRejectedValueOnce(new PlatformInteractionRequiredError(['s']));
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth, fetch: fetchMock });

    await expect(http.get('/x', taskSchema)).rejects.toBeInstanceOf(PlatformInteractionRequiredError);
    expect(auth.requestInteraction).toHaveBeenCalledOnce();
  });

  it('rejects responses that do not match the schema and reports them', async () => {
    const telemetry = { logError: vi.fn(), trackEvent: vi.fn() };
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: 1 }));
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth: createAuth(), telemetry, fetch: fetchMock });

    await expect(http.get('/tasks/1', taskSchema)).rejects.toBeInstanceOf(ResponseValidationError);
    expect(telemetry.logError).toHaveBeenCalledOnce();
  });

  it('passes the abort signal to fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: '1', title: 'A' }));
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth: createAuth(), fetch: fetchMock });
    const controller = new AbortController();

    await http.get('/tasks/1', taskSchema, { signal: controller.signal });

    expect(initOf(fetchMock, 0)?.signal).toBe(controller.signal);
  });

  it('supports empty 204 responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const http = createHttpClient({ baseUrl: 'http://bff', scopes: ['s'], auth: createAuth(), fetch: fetchMock });

    await expect(http.delete('/tasks/1', z.undefined())).resolves.toBeUndefined();
  });
});
