import type { AxiosResponse } from 'axios';
import type { z } from 'zod';

/** The response did not match the zod schema: backend responses are a trust boundary. */
export class ResponseValidationError extends Error {
  readonly issues: readonly z.core.$ZodIssue[];
  readonly method: string;
  readonly url: string;

  constructor(params: { issues: readonly z.core.$ZodIssue[]; method: string; url: string }) {
    super(`${params.method} ${params.url} returned a response that does not match the schema`);
    this.name = 'ResponseValidationError';
    this.issues = params.issues;
    this.method = params.method;
    this.url = params.url;
  }
}

/**
 * `http.get('/tasks').then(parseResponse(taskListSchema))`: the typed, validated body. A mismatch is an error (the
 * query/mutation fails and is reported through the QueryClient's telemetry), never data the UI silently trusts.
 */
export const parseResponse =
  <TSchema extends z.ZodType>(schema: TSchema) =>
  (response: AxiosResponse): z.output<TSchema> => {
    const parsed = schema.safeParse(response.data);
    if (!parsed.success) {
      const { method = 'get', baseURL = '', url = '' } = response.config;
      throw new ResponseValidationError({ issues: parsed.error.issues, method: method.toUpperCase(), url: `${baseURL}${url}` });
    }
    return parsed.data;
  };
