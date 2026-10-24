import { describe, expect, it, vi } from 'vitest';

const flush = () => Promise.resolve();
import { createDevtoolsRegistry, selectDevtoolsPanel } from './create-devtools-registry';
import type { DevtoolsSnapshot } from './create-devtools-registry';

const noopMount = () => () => {};

describe('createDevtoolsRegistry', () => {
  it('counts mounts (StrictMode double effects) and keeps snapshots immutable', async () => {
    const registry = createDevtoolsRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.registerPanel('tasks', noopMount);
    await flush();
    const before = registry.getSnapshot();

    const releaseA = registry.markMounted('tasks');
    const releaseB = registry.markMounted('tasks');
    releaseA();
    releaseA();
    await flush();

    expect(registry.getSnapshot().panels[0]?.mountCount).toBe(1);
    expect(before.panels[0]?.mountCount).toBe(0);
    releaseB();
    await flush();
    expect(registry.getSnapshot().panels[0]?.mountCount).toBe(0);
    expect(listener).toHaveBeenCalled();
  });

  it('unregisters only its own registration', async () => {
    const registry = createDevtoolsRegistry();
    const unregisterOld = registry.registerPanel('tasks', noopMount);
    registry.registerPanel('tasks', noopMount);
    unregisterOld();
    await flush();
    expect(registry.getSnapshot().panels).toHaveLength(1);
  });
});

const snapshot = (mounted: Record<string, number>): DevtoolsSnapshot => ({
  panels: ['host', 'tasks', 'reports'].map((name) => ({ name, mount: noopMount, mountCount: mounted[name] ?? 0, registeredAt: 0 })),
});

describe('selectDevtoolsPanel', () => {
  it('selects the host when no remote is mounted', () => {
    expect(selectDevtoolsPanel(snapshot({}), 'host', null)).toBe('host');
  });

  it('selects the single mounted remote', () => {
    expect(selectDevtoolsPanel(snapshot({ tasks: 1 }), 'host', null)).toBe('tasks');
  });

  it('falls back to the host when several remotes are mounted', () => {
    expect(selectDevtoolsPanel(snapshot({ tasks: 1, reports: 2 }), 'host', null)).toBe('host');
  });

  it('respects a pin while the pinned client is registered', () => {
    expect(selectDevtoolsPanel(snapshot({ tasks: 1 }), 'host', 'reports')).toBe('reports');
    expect(selectDevtoolsPanel(snapshot({ tasks: 1 }), 'host', 'gone')).toBe('tasks');
  });
});
