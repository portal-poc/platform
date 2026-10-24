import type { MountDevtoolsPanel, PlatformDevtools } from '@portal-poc/platform-contract';

export type DevtoolsPanelEntry = {
  name: string;
  mount: MountDevtoolsPanel;
  /** A counter, not a boolean: StrictMode double effects and an app mounted in two places. */
  mountCount: number;
  registeredAt: number;
};

export type DevtoolsSnapshot = {
  /** Only registered (= loaded) applications. Not-yet-loaded remotes are never listed. */
  panels: readonly DevtoolsPanelEntry[];
};

export type DevtoolsRegistry = PlatformDevtools & {
  subscribe: (listener: () => void) => () => void;
  /** Immutable snapshot for `useSyncExternalStore`. */
  getSnapshot: () => DevtoolsSnapshot;
};

/**
 * Host-side registry of devtools mount functions. The host never receives remote QueryClients:
 * a remote registers a function that mounts ITS OWN devtools into a host container.
 */
export const createDevtoolsRegistry = (now: () => number = Date.now): DevtoolsRegistry => {
  const panels = new Map<string, { mount: MountDevtoolsPanel; registeredAt: number }>();
  const mountCounts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let snapshot: DevtoolsSnapshot = { panels: [] };
  let isUpdateScheduled = false;

  const publishSnapshot = () => {
    isUpdateScheduled = false;
    snapshot = {
      panels: [...panels.entries()].map(([name, panel]) => ({
        name,
        mount: panel.mount,
        mountCount: mountCounts.get(name) ?? 0,
        registeredAt: panel.registeredAt,
      })),
    };
    for (const listener of listeners) {
      listener();
    }
  };

  // Registration happens while a remote renders (QueryClient is created lazily in render), so updates are
  // published in a microtask: never setState in another component during render; bursts are coalesced.
  const rebuildSnapshot = () => {
    if (!isUpdateScheduled) {
      isUpdateScheduled = true;
      queueMicrotask(publishSnapshot);
    }
  };

  const registerPanel: PlatformDevtools['registerPanel'] = (name, mount) => {
    const entry = { mount, registeredAt: now() };
    panels.set(name, entry);
    rebuildSnapshot();
    return () => {
      if (panels.get(name) === entry) {
        panels.delete(name);
        rebuildSnapshot();
      }
    };
  };

  const changeMountCount = (name: string, delta: number) => {
    const next = Math.max(0, (mountCounts.get(name) ?? 0) + delta);
    if (next === 0) {
      mountCounts.delete(name);
    } else {
      mountCounts.set(name, next);
    }
    rebuildSnapshot();
  };

  const markMounted: PlatformDevtools['markMounted'] = (name) => {
    changeMountCount(name, 1);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      changeMountCount(name, -1);
    };
  };

  return {
    registerPanel,
    markMounted,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
};

/**
 * Auto-selection: exactly one mounted remote → that remote; otherwise (host pages only, or several remote widgets)
 * → the host. A manual choice (pin) disables auto-switching.
 */
export const selectDevtoolsPanel = (
  snapshot: DevtoolsSnapshot,
  hostName: string,
  pinnedName: string | null,
): string | null => {
  const names = snapshot.panels.map((panel) => panel.name);
  if (pinnedName && names.includes(pinnedName)) {
    return pinnedName;
  }
  const mountedRemotes = snapshot.panels.filter((panel) => panel.name !== hostName && panel.mountCount > 0);
  if (mountedRemotes.length === 1 && mountedRemotes[0]) {
    return mountedRemotes[0].name;
  }
  if (names.includes(hostName)) {
    return hostName;
  }
  return names[0] ?? null;
};
