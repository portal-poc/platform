import type { z } from 'zod';
import type { PlatformAuth, PlatformTelemetry } from '@portal/platform-contract';
import { isInteractionRequiredError } from '../auth/errors';
import { HttpError, ResponseValidationError } from './errors';

export type HttpClientOptions = {
  baseUrl: string;
  scopes: readonly string[];
  auth: PlatformAuth;
  telemetry?: PlatformTelemetry;
  /** Injected for tests. */
  fetch?: typeof fetch;
};

type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = {
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, QueryValue>>;
  /** Mutations get a generated id when omitted (section 12.5). */
  correlationId?: string;
};

export type BodyRequestOptions = RequestOptions & {
  body?: unknown;
};

type ReadMethod = <TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options?: RequestOptions,
) => Promise<z.output<TSchema>>;

type WriteMethod = <TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  options?: BodyRequestOptions,
) => Promise<z.output<TSchema>>;

export type HttpClient = {
  get: ReadMethod;
  delete: WriteMethod;
  post: WriteMethod;
  put: WriteMethod;
  patch: WriteMethod;
};

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const CORRELATION_HEADER = 'X-Correlation-Id';

const buildUrl = (baseUrl: string, path: string, query: RequestOptions['query']): string => {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const readBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }
  return text;
};

const requiresInteraction = (response: Response): boolean => {
  const challenge = response.headers.get('www-authenticate') ?? '';
  return challenge.includes('interaction_required') || challenge.includes('insufficient_claims');
};

/**
 * HTTP client for one BFF. Built by each application from `platform.auth` + its own BFF address
 * (the host never knows remote BFF addresses). Methods are injected into `queryOptions` / mutation factories.
 */
export const createHttpClient = (options: HttpClientOptions): HttpClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  const send = async (
    method: HttpMethod,
    url: string,
    token: string,
    requestOptions: BodyRequestOptions,
    correlationId: string | undefined,
  ): Promise<Response> => {
    const headers = new Headers(requestOptions.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Accept', 'application/json');
    if (correlationId) {
      headers.set(CORRELATION_HEADER, correlationId);
    }
    const hasBody = requestOptions.body !== undefined;
    if (hasBody) {
      headers.set('Content-Type', 'application/json');
    }
    return fetchImpl(url, {
      method,
      headers,
      ...(hasBody ? { body: JSON.stringify(requestOptions.body) } : {}),
      ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
    });
  };

  const refreshTokenAfterUnauthorized = async (): Promise<string> => {
    try {
      return await options.auth.getAccessToken(options.scopes, { forceRefresh: true });
    } catch (error) {
      if (isInteractionRequiredError(error)) {
        await options.auth.requestInteraction(options.scopes);
      }
      throw error;
    }
  };

  const request = async <TSchema extends z.ZodType>(
    method: HttpMethod,
    path: string,
    schema: TSchema,
    requestOptions: BodyRequestOptions = {},
  ): Promise<z.output<TSchema>> => {
    const url = buildUrl(options.baseUrl, path, requestOptions.query);
    const correlationId = requestOptions.correlationId ?? (method === 'GET' ? undefined : crypto.randomUUID());

    let token = await options.auth.getAccessToken(options.scopes);
    let response = await send(method, url, token, requestOptions, correlationId);

    // One retry after re-acquiring the token (expired/revoked token on the BFF side).
    if (response.status === 401) {
      token = await refreshTokenAfterUnauthorized();
      response = await send(method, url, token, requestOptions, correlationId);
      if (response.status === 401 && requiresInteraction(response)) {
        await options.auth.requestInteraction(options.scopes);
      }
    }

    const body = await readBody(response);
    if (!response.ok) {
      throw new HttpError({ status: response.status, body, method, url, ...(correlationId ? { correlationId } : {}) });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const error = new ResponseValidationError({ issues: parsed.error.issues, method, url });
      options.telemetry?.logError(error, { issues: parsed.error.issues });
      throw error;
    }
    return parsed.data;
  };

  return {
    get: (path, schema, requestOptions) => request('GET', path, schema, requestOptions),
    delete: (path, schema, requestOptions) => request('DELETE', path, schema, requestOptions),
    post: (path, schema, requestOptions) => request('POST', path, schema, requestOptions),
    put: (path, schema, requestOptions) => request('PUT', path, schema, requestOptions),
    patch: (path, schema, requestOptions) => request('PATCH', path, schema, requestOptions),
  };
};
