export const DEVTOOLS_PIN_STORAGE_KEY = 'portal.devtools.pinned';

export const readPinnedPanel = (storageKey: string): string | null => {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
};

export const writePinnedPanel = (storageKey: string, name: string | null) => {
  try {
    if (name) {
      localStorage.setItem(storageKey, name);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Storage unavailable: pinning just does not survive reloads.
  }
};
