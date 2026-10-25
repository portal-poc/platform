import type { PlatformLeaveGuard, PlatformNavigation } from '@portal-poc/platform-contract';

type LeaveGuardsOptions = {
  /** The page's own confirmation for guards without `confirm` (the host's dialog; `window.confirm` standalone). */
  ask: (guard: PlatformLeaveGuard, pathname: string) => Promise<boolean>;
  /** Tells the user why leaving was refused (a `lock` guard). */
  notifyLocked: (message: string) => void;
};

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  // The browser shows its own prompt; custom dialogs and locks are impossible on reload / tab close.
  event.preventDefault();
};

export type LeaveGuards = PlatformNavigation & {
  /** Any guard registered, whatever it allows: a reload would make the browser ask. */
  hasGuards: () => boolean;
};

/**
 * The page's registry of leave guards: what `platform.navigation` is. One per page (the host's, or a standalone
 * app's), shared by every app on it, so that every router's blocker and every app ask the same guards.
 */
export const createLeaveGuards = (options: LeaveGuardsOptions): LeaveGuards => {
  const guards = new Set<PlatformLeaveGuard>();
  let pending: { pathname: string; decision: Promise<boolean> } | null = null;

  const blockingFor = (pathname: string) => [...guards].filter((guard) => !guard.allows?.(pathname));

  const syncBeforeUnload = () => {
    if (typeof window === 'undefined') {
      return;
    }
    if (guards.size > 0) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    } else {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  };

  const decide = async (pathname: string): Promise<boolean> => {
    const blocking = blockingFor(pathname);
    const lock = blocking.find((guard) => guard.lock);
    if (lock) {
      options.notifyLocked(lock.message);
      return false;
    }
    // Every guard must agree (a host form and a remote form both ask); the first "stay" ends it.
    for (const guard of blocking) {
      const leave = guard.confirm ? await guard.confirm(pathname) : await options.ask(guard, pathname);
      if (!leave) {
        return false;
      }
    }
    return true;
  };

  return {
    hasGuards: () => guards.size > 0,
    guard: (guard) => {
      guards.add(guard);
      syncBeforeUnload();
      return () => {
        guards.delete(guard);
        syncBeforeUnload();
      };
    },
    isBlocked: (pathname) => blockingFor(pathname).length > 0,
    confirmLeave: (pathname) => {
      // Back/forward reaches every router on the page (the host's and a bridge app's): one decision for all of them.
      if (pending?.pathname === pathname) {
        return pending.decision;
      }
      const decision = decide(pathname).finally(() => {
        pending = null;
      });
      pending = { pathname, decision };
      return decision;
    },
  };
};
