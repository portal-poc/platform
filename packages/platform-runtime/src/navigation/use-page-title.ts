import { useEffect } from 'react';
import { usePlatform } from '../provider/PlatformProvider';

/**
 * This page's title while it is mounted; the host composes "<title> · <section> · Portal" and falls back to the
 * section's title when the page unmounts. No-op on a host without `document` (older than contract 1.2).
 */
export const usePageTitle = (title: string | null | undefined): void => {
  const platformDocument = usePlatform().document;

  useEffect(() => {
    if (!platformDocument || !title) {
      return undefined;
    }
    platformDocument.setTitle(title);
    return () => {
      platformDocument.setTitle(null);
    };
  }, [platformDocument, title]);
};
