import { describe, expect, it, vi } from 'vitest';
import { createDevtoolsRegistry, selectDevtoolsPanel } from './create-devtools-registry';

const noopMount = () => () => {};

describe('createDevtoolsRegistry', () => {
  it('counts mounts (StrictMode double effects) and keeps snapshots immutable', () => {
    const registry = createDevtoolsRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    registry.registerPanel('tasks', noopMount);
    const before = registry.getSnapshot();

    const releaseA = registry.markMounted('tasks');
    const releaseB = registry.markMounted('tasks');
    releaseA();
    releaseA();

    expect(registry.getSnapshot().panels[0]?.mountCount).toBe(1);
    expect(before.panels[0]?.mountCount).toBe(0);
    releaseB();
    expect(registry.getSnapshot().panels[0]?.mountCount).toBe(0);
    expect(listener).toHaveBeenCalled();
  });

  it('unregisters only its own registration', () => {
    const registry = createDevtoolsRegistry();
    const unregisterOld = registry.registerPanel('tasks', noopMount);
    registry.registerPanel('tasks', noopMount);
    unregisterOld();
    expect(registry.getSnapshot().panels).toHaveLength(1);
  });
});

describe('selectDevtoolsPanel', () => {
  const registry = createDevtoolsRegistry();
  registry.registerPanel('host', noopMount);
  registry.registerPanel('tasks', noopMount);
  registry.registerPanel('reports', noopMount);

  it('selects the host when no remote is mounted', () => {
    expect(selectDevtoolsPanel(registry.getSnapshot(), 'host', null)).toBe('host');
  });

  it('selects the single mounted remote', () => {
    const release = registry.markMounted('tasks');
    expect(selectDevtoolsPanel(registry.getSnapshot(), 'host', null)).toBe('tasks');
    release();
  });

  it('falls back to the host when several remotes are mounted', () => {
    const releaseTasks = registry.markMounted('tasks');
    const releaseReports = registry.markMounted('reports');
    expect(selectDevtoolsPanel(registry.getSnapshot(), 'host', null)).toBe('host');
    releaseTasks();
    releaseReports();
  });

  it('respects a pin while the pinned client is registered', () => {
    const release = registry.markMounted('tasks');
    expect(selectDevtoolsPanel(registry.getSnapshot(), 'host', 'reports')).toBe('reports');
    expect(selectDevtoolsPanel(registry.getSnapshot(), 'host', 'gone')).toBe('tasks');
    release();
  });
});
