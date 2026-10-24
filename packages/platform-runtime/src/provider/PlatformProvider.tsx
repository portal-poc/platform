import { createContext, use, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type {
  PlatformAuth,
  PlatformContract,
  PlatformEnv,
  PlatformEventBus,
  PlatformTelemetry,
} from '@portal-poc/platform-contract';

const PlatformContext = createContext<PlatformContract | null>(null);

type PlatformProviderProps = {
  value: PlatformContract;
  children: ReactNode;
};

/**
 * Every application wraps itself with its own provider built from props (RemoteRoot receives `platform` as a prop).
 * The context object does not have to be an MF singleton: we never rely on the host's provider.
 */
export const PlatformProvider = ({ value, children }: PlatformProviderProps) => (
  <PlatformContext value={value}>{children}</PlatformContext>
);

export const usePlatform = (): PlatformContract => {
  const platform = use(PlatformContext);
  if (!platform) {
    throw new Error('usePlatform() must be used inside <PlatformProvider>.');
  }
  return platform;
};

export const usePlatformAuth = (): PlatformAuth => usePlatform().auth;

export const usePlatformEvents = (): PlatformEventBus => usePlatform().events;

export const usePlatformTelemetry = (): PlatformTelemetry => usePlatform().telemetry;

export const usePlatformEnv = (): PlatformEnv => usePlatform().env;

export const usePlatformLanguage = (): string => {
  const { locale } = usePlatform();
  const getLanguage = () => locale.language;
  return useSyncExternalStore(locale.subscribe, getLanguage, getLanguage);
};
