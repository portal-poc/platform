import { useSpinDelay } from 'spin-delay';

export type LoadingStage = 'idle' | 'button' | 'blocking';

/** JS variant for when the stage drives logic/text/analytics. Prefer the CSS primitives for visuals. */
export const useLoadingStage = (isPending: boolean): LoadingStage => {
  const isButtonStage = useSpinDelay(isPending, { delay: 300, minDuration: 0, ssr: false });
  const isBlockingStage = useSpinDelay(isPending, { delay: 2000, minDuration: 0, ssr: false });
  if (isBlockingStage) {
    return 'blocking';
  }
  return isButtonStage ? 'button' : 'idle';
};
