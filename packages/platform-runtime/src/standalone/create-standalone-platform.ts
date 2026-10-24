import { PLATFORM_CONTRACT_VERSION } from '@portal/platform-contract';
import type { PlatformAuth, PlatformContract, PlatformEnv, PlatformLocale } from '@portal/platform-contract';
import { createDevtoolsRegistry } from '../devtools/create-devtools-registry';
import type { DevtoolsRegistry } from '../devtools/create-devtools-registry';
import { createPlatformEventBus } from '../events/create-platform-event-bus';
import { createConsoleTelemetry } from '../telemetry/create-console-telemetry';

type StandalonePlatformConfig = {
  appName: string;
  env: PlatformEnv;
  /** Built by the caller: `createMockPlatformAuth()` or `createMsalPlatformAuth(ownPca)` per runtime config. */
  auth: PlatformAuth;
  language?: string;
  devtools?: boolean;
};

export type StandalonePlatform = {
  /** Exactly the type the host provides: RemoteRoot cannot tell where it runs. */
  platform: PlatformContract;
  devtoolsRegistry: DevtoolsRegistry | null;
};

const createStaticLocale = (language: string): PlatformLocale => ({
  language,
  subscribe: () => () => {},
});

/** Builds a full PlatformContract for running a remote outside the host (local development, standalone deploy). */
export const createStandalonePlatform = (config: StandalonePlatformConfig): StandalonePlatform => {
  const devtoolsRegistry = config.devtools === false ? null : createDevtoolsRegistry();
  const platform: PlatformContract = {
    contractVersion: PLATFORM_CONTRACT_VERSION,
    auth: config.auth,
    env: config.env,
    events: createPlatformEventBus(),
    telemetry: createConsoleTelemetry({ app: config.appName }),
    locale: createStaticLocale(config.language ?? 'en'),
    ...(devtoolsRegistry ? { devtools: devtoolsRegistry } : {}),
  };
  return { platform, devtoolsRegistry };
};
