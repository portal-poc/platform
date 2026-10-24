import { useEffect, useState } from 'react';

/**
 * `true` once `active` has stayed true for `delayMs`; `false` as soon as it turns false.
 * Replaces `spin-delay`: the DS is an MF singleton and must stay ESM-clean (CommonJS deps of a shared module are not
 * pre-bundled by Vite in consuming apps).
 */
export const useDelayedFlag = (active: boolean, delayMs: number): boolean => {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setElapsed(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);

  return active && elapsed;
};
