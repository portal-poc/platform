/**
 * Mock access token: `mock.<base64url(json payload)>`. Opaque for the frontend, parsed by the mock BFFs.
 * Payload mirrors the JWT claims the real BFFs read (sub, name, scp, exp in seconds).
 */
export type MockTokenPayload = {
  sub: string;
  name: string;
  preferred_username: string;
  scp: readonly string[];
  iat: number;
  exp: number;
  jti: string;
};

const MOCK_TOKEN_PREFIX = 'mock.';

const toBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

export const encodeMockToken = (payload: MockTokenPayload): string =>
  `${MOCK_TOKEN_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
