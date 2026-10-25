import type { PlatformContract } from '@portal-poc/platform-contract';

export type PlatformBinding = {
  /** Called by the app's entry (`RemoteRoot`, standalone, preload) with the platform it was given. Idempotent. */
  bind: (platform: PlatformContract) => void;
  /** The bound platform; throws before the app was mounted. */
  get: () => PlatformContract;
};

/**
 * The platform as a module-level value. It arrives only at mount time (a prop of `RemoteRoot`), while the http client
 * is created when its module is imported: the client reads the platform from here on every request. Re-binding (the
 * host re-mounts the app with a new platform object) is picked up by the next request.
 */
export const createPlatformBinding = (appName: string): PlatformBinding => {
  let current: PlatformContract | null = null;
  return {
    bind: (platform) => {
      current = platform;
    },
    get: () => {
      if (!current) {
        throw new Error(`${appName}: the platform is not bound yet — call bind(platform) in the app's entry before any request.`);
      }
      return current;
    },
  };
};
