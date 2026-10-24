import { describe, expect, it, vi } from 'vitest';
import { createPlatformEventBus } from './create-platform-event-bus';

describe('createPlatformEventBus', () => {
  it('delivers typed events to subscribers until they unsubscribe', () => {
    const bus = createPlatformEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe('bookmarks.changed', listener);

    bus.emit('bookmarks.changed', { source: 'tasks', correlationId: 'c1' });
    unsubscribe();
    bus.emit('bookmarks.changed', { source: 'tasks' });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ source: 'tasks', correlationId: 'c1' });
  });
});
