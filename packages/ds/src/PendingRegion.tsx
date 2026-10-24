import { styled } from '@mui/joy';
import type { ReactNode } from 'react';
import { useDelayedFlag } from './use-delayed-flag';
import { Spinner } from './Spinner';

/**
 * One attribute (`data-pending`) drives every stage via asymmetric CSS transition delays:
 * delay on enter, none on exit. Thresholds are overridable CSS variables.
 */
const Region = styled('div')({
  '--pending-button-delay': '300ms',
  '--pending-overlay-delay': '2s',
  position: 'relative',
  '& > [data-pending-overlay]': {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(255 255 255 / 0.6)',
    opacity: 0,
    visibility: 'hidden',
    transition: 'opacity 150ms, visibility 0s 150ms',
  },
  '&[data-pending] > [data-pending-overlay]': {
    opacity: 1,
    visibility: 'visible',
    transition: 'opacity 200ms var(--pending-overlay-delay), visibility 0s var(--pending-overlay-delay)',
  },
});

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } as const;

type PendingRegionProps = {
  isPending: boolean;
  children: ReactNode;
  /** Announced to screen readers after 2 s — the only JS-timed part of the pattern. */
  stillLoadingMessage?: string;
};

export const PendingRegion = ({ isPending, children, stillLoadingMessage = 'Still loading…' }: PendingRegionProps) => {
  const isSlow = useDelayedFlag(isPending, 2000);
  return (
    <Region data-pending={isPending ? '' : undefined} aria-busy={isPending}>
      {children}
      <div data-pending-overlay="" aria-hidden>
        <Spinner delay={0} />
      </div>
      <span aria-live="polite" style={visuallyHidden}>
        {isSlow ? stillLoadingMessage : ''}
      </span>
    </Region>
  );
};
