const DEVTOOLS_FLAG_STORAGE_KEY = 'portal.devtools';

/** Toolbar renders in dev, or on stands behind `?devtools=1` / `localStorage['portal.devtools'] = '1'`. */
export const isDevtoolsEnabled = (isDev: boolean, location: Pick<Location, 'search'> = window.location): boolean => {
  if (isDev) {
    return true;
  }
  if (new URLSearchParams(location.search).get('devtools') === '1') {
    return true;
  }
  try {
    return localStorage.getItem(DEVTOOLS_FLAG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};
