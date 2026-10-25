/**
 * A tab keeps running the build it was opened with. Overwritten-in-place folders (snapshot remotes, stand hosts) drop
 * the chunks of earlier builds after a day, so a long-open tab can ask for a chunk that is gone (404) — or for a chunk
 * of a remote version the stand no longer runs. The fix is the same as for a deploy: reload, and the page starts on
 * the current builds. Network failures look identical to the browser; one reload is harmless there too.
 */

const RELOAD_STORAGE_KEY = 'portal.staleBuild.reloadedAt';
/** A second failure within this window is not a stale tab (the fresh page fails too): the error is shown instead. */
const RELOAD_COOLDOWN_MS = 60_000;

/** What browsers and loaders say when a script or style chunk cannot be fetched. */
const CHUNK_LOAD_FAILURES = [
  /failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite preload helper
  /loading (css )?chunk .+ failed/i, // webpack-style loaders
  /RUNTIME-008/, // Module Federation: remote entry script failed to load
];

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : typeof error === 'string' ? error : '');

/** True when the error (or one of its causes) is a chunk that could not be loaded. */
export const isStaleBuildError = (error: unknown): boolean => {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth += 1) {
    const message = messageOf(current);
    if (CHUNK_LOAD_FAILURES.some((pattern) => pattern.test(message))) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
};

const readReloadedAt = (): number => {
  try {
    return Number(sessionStorage.getItem(RELOAD_STORAGE_KEY) ?? 0);
  } catch {
    return 0;
  }
};

/**
 * Reloads the page unless it already did so within the cooldown (no reload loops). Returns whether it reloads: the
 * caller then renders nothing and waits for the navigation instead of showing an error.
 */
export const reloadForStaleBuild = (): boolean => {
  if (Date.now() - readReloadedAt() < RELOAD_COOLDOWN_MS) {
    return false;
  }
  try {
    sessionStorage.setItem(RELOAD_STORAGE_KEY, String(Date.now()));
  } catch {
    // Without storage there is no loop guard: better to show the error than risk reloading forever.
    return false;
  }
  window.location.reload();
  return true;
};

type PreloadErrorEvent = Event & { payload?: unknown };

const handlePreloadError = (event: PreloadErrorEvent) => {
  if (reloadForStaleBuild()) {
    // Vite rethrows unless prevented; the page is going away anyway.
    event.preventDefault();
  }
};

const handleRejection = (event: PromiseRejectionEvent) => {
  if (isStaleBuildError(event.reason) && reloadForStaleBuild()) {
    event.preventDefault();
  }
};

/**
 * Page-wide safety net, installed once by the host before anything loads: Vite's `vite:preloadError` (a lazy chunk
 * of the host or of any remote failed) and unhandled rejections with a chunk-load error. Loaders that catch their
 * errors (the host's remote loader, error boundaries) call `isStaleBuildError` + `reloadForStaleBuild` themselves.
 */
export const installStaleBuildRecovery = (): (() => void) => {
  window.addEventListener('vite:preloadError', handlePreloadError);
  window.addEventListener('unhandledrejection', handleRejection);
  return () => {
    window.removeEventListener('vite:preloadError', handlePreloadError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
};
