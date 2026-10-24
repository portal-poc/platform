export { createMockPlatformAuth, DEFAULT_MOCK_ACCOUNTS } from './create-mock-platform-auth';
export type { MockPlatformAuth } from './create-mock-platform-auth';
export { createRemoteAuth } from './create-remote-auth';
export {
  isInteractionRequiredError,
  PlatformInteractionRequiredError,
  PlatformScopeNotAllowedError,
} from './errors';
export { encodeMockToken } from './mock-token';
export type { MockTokenPayload } from './mock-token';
export { clearQueryClientForAccountChange, useClearCacheOnAccountChange } from './use-clear-cache-on-account-change';
