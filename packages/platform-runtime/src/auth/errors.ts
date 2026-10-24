/** Thrown when a token cannot be obtained silently. Only the host may start interaction (redirect). */
export class PlatformInteractionRequiredError extends Error {
  readonly scopes: readonly string[];

  constructor(scopes: readonly string[], options?: { cause?: unknown }) {
    super(`Interaction required to obtain a token for scopes: ${scopes.join(', ')}`, options);
    this.name = 'PlatformInteractionRequiredError';
    this.scopes = scopes;
  }
}

/** Thrown when a remote requests a scope outside of its allowlist. Protects against mistakes, not against malice. */
export class PlatformScopeNotAllowedError extends Error {
  readonly remoteName: string;
  readonly rejectedScopes: readonly string[];
  readonly allowedScopes: readonly string[];

  constructor(remoteName: string, rejectedScopes: readonly string[], allowedScopes: readonly string[]) {
    super(
      `Remote "${remoteName}" requested scope(s) outside of its allowlist: ${rejectedScopes.join(', ')}. ` +
        `Allowed: ${allowedScopes.length > 0 ? allowedScopes.join(', ') : '(none)'}. ` +
        'Ask the platform team to extend the allowlist in the host configuration.',
    );
    this.name = 'PlatformScopeNotAllowedError';
    this.remoteName = remoteName;
    this.rejectedScopes = rejectedScopes;
    this.allowedScopes = allowedScopes;
  }
}

export const isInteractionRequiredError = (error: unknown): error is PlatformInteractionRequiredError =>
  error instanceof PlatformInteractionRequiredError;
