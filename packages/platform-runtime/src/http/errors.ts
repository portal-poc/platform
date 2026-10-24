import type { z } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly method: string;
  readonly url: string;
  readonly correlationId: string | undefined;

  constructor(params: { status: number; body: unknown; method: string; url: string; correlationId?: string }) {
    super(`${params.method} ${params.url} failed with HTTP ${params.status}`);
    this.name = 'HttpError';
    this.status = params.status;
    this.body = params.body;
    this.method = params.method;
    this.url = params.url;
    this.correlationId = params.correlationId;
  }
}

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

export const isHttpError = (error: unknown): error is HttpError => error instanceof HttpError;
