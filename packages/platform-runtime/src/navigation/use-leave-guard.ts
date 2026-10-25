import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PlatformLeaveGuard } from '@portal-poc/platform-contract';
import { usePlatform } from '../provider/PlatformProvider';

export type LeaveGuardOptions = {
  /** What would be lost / why leaving is not possible now: the host's dialog or lock notice shows it. */
  message?: string;
  /** Navigations that are not "leaving" (steps of one wizard), by full browser pathname. */
  allows?: (pathname: string) => boolean;
  /** Refuse leaving instead of asking (a mutation in flight). */
  lock?: boolean;
  /** `own`: render your dialog from the returned `state` / `leave` / `stay`. Default: the host's dialog. */
  dialog?: 'host' | 'own';
};

export type LeaveGuard = {
  /** `asking`: a navigation waits for your dialog (`dialog: 'own'` only). */
  state: 'idle' | 'asking';
  /** Where the waiting navigation goes. */
  pathname: string | null;
  leave: () => void;
  stay: () => void;
  /** Drops the guard right now (saved: the next navigation is not "leaving"). Re-armed when `when` turns true again. */
  release: () => void;
};

type Asking = { pathname: string; resolve: (leave: boolean) => void };

const DEFAULT_MESSAGE = 'You have unsaved changes.';

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
};

/**
 * "Do not leave this page yet" while `when` is true — the same in every mode (integrated, bridge, standalone): the
 * guard goes to `platform.navigation`, whose blockers sit in the host and in the generated entries of own routers.
 * Never call React Router's `useBlocker` yourself: a router supports one blocker, and integrated apps share the host's.
 * On a host without `navigation` (older than contract 1.2) it falls back to the browser's prompt on reload / close.
 */
export const useLeaveGuard = (when: boolean, options: LeaveGuardOptions = {}): LeaveGuard => {
  const { navigation } = usePlatform();
  const [asking, setAsking] = useState<Asking | null>(null);
  const optionsRef = useRef(options);
  // Before the guard effect: a registered guard always reads the options of the last committed render.
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const releaseRef = useRef<(() => void) | null>(null);
  const askingRef = useRef<Asking | null>(null);
  const [released, setReleased] = useState(false);

  if (!when && released) {
    setReleased(false);
  }
  const active = when && !released;

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    if (!navigation) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
    // Getters: the registered guard always reads the latest options without re-registering on every render.
    const guard: PlatformLeaveGuard = {
      get message() {
        return optionsRef.current.message ?? DEFAULT_MESSAGE;
      },
      get lock() {
        return optionsRef.current.lock ?? false;
      },
      allows: (pathname) => optionsRef.current.allows?.(pathname) ?? false,
      ...(options.dialog === 'own'
        ? {
            confirm: (pathname: string) =>
              new Promise<boolean>((resolve) => {
                // A newer navigation (back while the dialog is open) replaces the question: the older one stays.
                askingRef.current?.resolve(false);
                askingRef.current = { pathname, resolve };
                setAsking(askingRef.current);
              }),
          }
        : {}),
    };
    const release = navigation.guard(guard);
    releaseRef.current = release;
    return () => {
      release();
      releaseRef.current = null;
      // Unmounted with the dialog open: the waiting navigation must not hang.
      askingRef.current?.resolve(false);
      askingRef.current = null;
    };
    // `dialog` decides the guard's shape; other options are read through the ref.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [active, navigation, options.dialog]);

  const answer = (leave: boolean) => {
    askingRef.current?.resolve(leave);
    askingRef.current = null;
    setAsking(null);
  };

  const release = () => {
    releaseRef.current?.();
    releaseRef.current = null;
    setReleased(true);
  };

  return {
    state: asking ? 'asking' : 'idle',
    pathname: asking?.pathname ?? null,
    leave: () => answer(true),
    stay: () => answer(false),
    release,
  };
};
