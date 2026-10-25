import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { PlatformEventBus } from '@portal-poc/platform-contract';
import { bookmarksChanged } from './catalog';
import { defineEvent } from './define-event';
import { EventPayloadError, publishEvent, subscribeEvent } from './publish-subscribe';
import type { EventPlatform } from './publish-subscribe';

/** A minimal transport, like the host's bus: payloads pass through untouched. */
const createBus = (): PlatformEventBus => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    emit: (name, payload) => listeners.get(name)?.forEach((listener) => listener(payload)),
    subscribe: (name, listener) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      return () => set.delete(listener);
    },
  };
};

const createPlatform = (): EventPlatform => ({
  events: createBus(),
  telemetry: { logError: vi.fn(), trackEvent: vi.fn() },
});

describe('event catalog helpers', () => {
  it('delivers a validated payload until unsubscribed', () => {
    const platform = createPlatform();
    const listener = vi.fn();
    const unsubscribe = subscribeEvent(platform, bookmarksChanged, listener);

    publishEvent(platform, bookmarksChanged, { source: 'tasks', correlationId: 'c1' });
    unsubscribe();
    publishEvent(platform, bookmarksChanged, { source: 'tasks' });

    expect(listener).toHaveBeenCalledExactlyOnceWith({ source: 'tasks', correlationId: 'c1' });
  });

  it('skips and reports a payload from a publisher that broke the schema', () => {
    const platform = createPlatform();
    const listener = vi.fn();
    subscribeEvent(platform, bookmarksChanged, listener);

    // A raw emit, e.g. from an app built against another catalog version.
    platform.events.emit('bookmarks.changed', { source: 42 });

    expect(listener).not.toHaveBeenCalled();
    const [error] = vi.mocked(platform.telemetry.logError).mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(EventPayloadError);
    expect(error).toMatchObject({ event: 'bookmarks.changed', owner: 'tasks' });
  });

  it('accepts fields it does not know (an additive change by a newer publisher)', () => {
    const platform = createPlatform();
    const listener = vi.fn();
    subscribeEvent(platform, bookmarksChanged, listener);

    platform.events.emit('bookmarks.changed', { source: 'tasks', addedLater: true });

    expect(listener).toHaveBeenCalledExactlyOnceWith({ source: 'tasks' });
  });

  it('refuses to publish an invalid payload', () => {
    const platform = createPlatform();
    const strict = defineEvent('test.happened', 'platform', z.object({ id: z.uuid() }));
    const listener = vi.fn();
    platform.events.subscribe(strict.name, listener);

    publishEvent(platform, strict, { id: 'not-a-uuid' });

    expect(listener).not.toHaveBeenCalled();
    expect(platform.telemetry.logError).toHaveBeenCalledOnce();
  });
});
