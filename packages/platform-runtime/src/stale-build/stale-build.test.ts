import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaleBuildRecovery, isStaleBuildError, reloadForStaleBuild } from './stale-build';

describe('isStaleBuildError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://nexus/x/assets/a-1.js',
    'error loading dynamically imported module: https://nexus/x/assets/a-1.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/b-2.css',
    '[ Federation Runtime ]: RUNTIME-008 Failed to load script resources',
  ])('recognises "%s"', (message) => {
    expect(isStaleBuildError(new TypeError(message))).toBe(true);
  });

  it('looks through causes and ignores other errors', () => {
    const wrapped = new Error('Module "tasks/RemoteRoot" could not be loaded.', {
      cause: new TypeError('Failed to fetch dynamically imported module: https://nexus/x.js'),
    });
    expect(isStaleBuildError(wrapped)).toBe(true);
    expect(isStaleBuildError(new Error('Remote "tasks" implements platform contract v2'))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
  });
});

describe('reloadForStaleBuild', () => {
  const reload = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('location', { ...window.location, reload });
    reload.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reloads once, then lets the error through while the cooldown lasts', () => {
    vi.useFakeTimers();
    expect(reloadForStaleBuild()).toBe(true);
    expect(reloadForStaleBuild()).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(reloadForStaleBuild()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('reloads on vite:preloadError and prevents the rethrow', () => {
    const uninstall = installStaleBuildRecovery();
    const event = new Event('vite:preloadError', { cancelable: true });

    window.dispatchEvent(event);
    uninstall();

    expect(reload).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not reload while the page must stay (a leave guard), so the error is shown instead', () => {
    let guarded = true;
    const uninstall = installStaleBuildRecovery({ canReload: () => !guarded });

    expect(reloadForStaleBuild()).toBe(false);
    guarded = false;
    expect(reloadForStaleBuild()).toBe(true);
    uninstall();

    expect(reload).toHaveBeenCalledOnce();
  });
});
