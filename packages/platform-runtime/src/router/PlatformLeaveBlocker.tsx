import { useEffect } from 'react';
// The one place that may block a router: it asks the platform's guards instead of deciding itself.
// oxlint-disable-next-line no-restricted-imports
import { useBlocker } from 'react-router';
import type { PlatformContract } from '@portal-poc/platform-contract';

type PlatformLeaveBlockerProps = {
  platform: PlatformContract;
  /** The router's basename: guards work with full browser paths. */
  basename?: string;
};

/**
 * The single blocker of a data router, driven by `platform.navigation`. The host renders it in its layout; a
 * bridge or standalone app renders it inside its own router (generated entries). Apps only register guards
 * (`useLeaveGuard`). Search-only changes (filters) never ask.
 */
export const PlatformLeaveBlocker = ({ platform, basename = '' }: PlatformLeaveBlockerProps) => {
  const { navigation } = platform;
  const prefix = basename.replace(/\/$/, '');

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      navigation !== undefined &&
      currentLocation.pathname !== nextLocation.pathname &&
      navigation.isBlocked(`${prefix}${nextLocation.pathname}`),
  );

  useEffect(() => {
    if (blocker.state !== 'blocked' || !navigation) {
      return undefined;
    }
    let current = true;
    void navigation.confirmLeave(`${prefix}${blocker.location.pathname}`).then((leave) => {
      if (current) {
        if (leave) {
          blocker.proceed();
        } else {
          blocker.reset();
        }
      }
    });
    return () => {
      current = false;
    };
  }, [blocker, navigation, prefix]);

  return null;
};
