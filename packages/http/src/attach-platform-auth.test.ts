import { create, isAxiosError } from 'axios';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { PlatformAuth, PlatformContract } from '@portal-poc/platform-contract';
import { attachPlatformAuth } from './attach-platform-auth';
import { parseResponse, ResponseValidationError } from './parse-response';
import { createPlatformBinding } from './platform-binding';

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

/** The app's own axios instance (its settings) on a fake fetch, bound to a platform with the given auth. */
const createHttp = (fetchMock: Mock<typeof fetch>, auth: PlatformAuth = createAuth(), clientVersion?: string) => {
  const http = create({ adapter: 'fetch', env: { fetch: fetchMock }, timeout: 5000 });
  return attachPlatformAuth(http, {
    platform: () => ({ auth }) as PlatformContract,
    target: async () => ({ baseUrl: 'http://bff/api', scopes: ['s'] }),
    ...(clientVersion ? { clientVersion } : {}),
  });
};

const requestOf = (fetchMock: Mock<typeof fetch>, call: number): Request => {
  const [input, init] = fetchMock.mock.calls[call] ?? [];
  return new Request(input ?? '', init);
};

describe('attachPlatformAuth', () => {
  it('sends the bearer token to the target BFF; parseResponse validates the body', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: '1', title: 'A' }));
    const http = createHttp(fetchMock);

    const task = await http.get('/tasks/1', { params: { expand: true } }).then(parseResponse(taskSchema));

    expect(task).toEqual({ id: '1', title: 'A' });
    expect(requestOf(fetchMock, 0).url).toBe('http://bff/api/tasks/1?expand=true');
    expect(requestOf(fetchMock, 0).headers.get('Authorization')).toBe('Bearer t1');
    expect(requestOf(fetchMock, 0).headers.get('X-Correlation-Id')).toBeNull();
  });

  it('sends X-Client-Version when configured', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}));
    await createHttp(fetchMock, createAuth(), 'tasks@1.4.2').get('/x');

    expect(requestOf(fetchMock, 0).headers.get('X-Client-Version')).toBe('tasks@1.4.2');
  });

  it('generates X-Correlation-Id for mutations and keeps a provided one', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}, 201));
    const http = createHttp(fetchMock);

    await http.post('/tasks', { title: 'A' });
    await http.post('/tasks', { title: 'A' }, { headers: { 'X-Correlation-Id': 'corr-1' } });

    expect(requestOf(fetchMock, 0).headers.get('X-Correlation-Id')).toMatch(/[0-9a-f-]{36}/);
    expect(requestOf(fetchMock, 1).headers.get('X-Correlation-Id')).toBe('corr-1');
  });

  it('retries once after 401 with a force-refreshed token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: '1', title: 'A' }));
    const auth = createAuth();

    await expect(createHttp(fetchMock, auth).get('/tasks/1').then(parseResponse(taskSchema))).resolves.toEqual({ id: '1', title: 'A' });
    expect(auth.getAccessToken).toHaveBeenLastCalledWith(['s'], { forceRefresh: true });
    expect(requestOf(fetchMock, 1).headers.get('Authorization')).toBe('Bearer t2');
  });

  it('asks the host for interaction when the second 401 requires it', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: 'denied' }, 401, { 'www-authenticate': 'Bearer error="interaction_required"' }),
    );
    const auth = createAuth();

    const error: unknown = await createHttp(fetchMock, auth).get('/tasks/1').catch((caught: unknown) => caught);

    expect(isAxiosError(error) && error.response?.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.requestInteraction).toHaveBeenCalledWith(['s']);
  });

  it('asks the host for interaction when the token cannot be refreshed silently (error from another code copy)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}, 401));
    const auth = createAuth();
    // The host's own copy of the error class: recognised by name.
    const interactionRequired = Object.assign(new Error('interaction'), { name: 'PlatformInteractionRequiredError' });
    vi.mocked(auth.getAccessToken).mockResolvedValueOnce('t1').mockRejectedValueOnce(interactionRequired);

    await expect(createHttp(fetchMock, auth).get('/x')).rejects.toBe(interactionRequired);
    expect(auth.requestInteraction).toHaveBeenCalledOnce();
  });

  it('passes the abort signal through', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}));
    const controller = new AbortController();
    controller.abort();

    await expect(createHttp(fetchMock).get('/x', { signal: controller.signal })).rejects.toThrow();
  });
});

describe('parseResponse', () => {
  it('rejects bodies that do not match the schema', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ id: 1 }));

    await expect(createHttp(fetchMock).get('/tasks/1').then(parseResponse(taskSchema))).rejects.toBeInstanceOf(ResponseValidationError);
  });
});

describe('createPlatformBinding', () => {
  it('fails clearly before the app is mounted, then returns the bound platform', () => {
    const binding = createPlatformBinding('tasks');
    expect(() => binding.get()).toThrow(/tasks: the platform is not bound yet/);

    const platform = { auth: createAuth() } as PlatformContract;
    binding.bind(platform);
    expect(binding.get()).toBe(platform);
  });
});
