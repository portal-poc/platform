import { useDelayedFlag } from './use-delayed-flag';

export type LoadingStage = 'idle' | 'button' | 'blocking';

/** JS variant for when the stage drives logic/text/analytics. Prefer the CSS primitives for visuals. */
export const useLoadingStage = (isPending: boolean): LoadingStage => {
  const isButtonStage = useDelayedFlag(isPending, 300);
  const isBlockingStage = useDelayedFlag(isPending, 2000);
  if (isBlockingStage) {
    return 'blocking';
  }
  return isButtonStage ? 'button' : 'idle';
};
