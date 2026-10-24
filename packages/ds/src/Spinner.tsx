import { keyframes } from '@emotion/react';
import { styled } from '@mui/joy/styles';
import type { CSSProperties } from 'react';

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const rotate = keyframes({ to: { transform: 'rotate(360deg)' } });

const SIZES = { sm: 16, md: 28, lg: 40 } as const;

/**
 * The delay is pure CSS (zero re-renders, works in Suspense fallbacks which have no boolean to delay on).
 * A short fade-in emulates `minDuration`: content arriving right after the threshold shows only a faint spinner.
 * Only opacity/transform are animated (compositor).
 */
const SpinnerRoot = styled('output')({
  '--spinner-delay': '300ms',
  display: 'inline-block',
  flexShrink: 0,
  borderRadius: '50%',
  border: '3px solid var(--joy-palette-neutral-outlinedBorder)',
  borderTopColor: 'var(--joy-palette-primary-500)',
  opacity: 0,
  animation: `${fadeIn} 150ms var(--spinner-delay) both, ${rotate} 800ms linear var(--spinner-delay) infinite`,
  '@media (prefers-reduced-motion: reduce)': {
    animation: `${fadeIn} 150ms var(--spinner-delay) both`,
  },
});

type SpinnerProps = {
  /** ms before the spinner becomes visible. `0` when the delay is decided outside (e.g. in a button). */
  delay?: number;
  size?: keyof typeof SIZES;
  label?: string;
};

export const Spinner = ({ delay = 300, size = 'md', label = 'Loading' }: SpinnerProps) => {
  const px = SIZES[size];
  const style = { '--spinner-delay': `${delay}ms`, width: px, height: px } as CSSProperties;
  return <SpinnerRoot aria-label={label} style={style} />;
};

/** Default Suspense fallback across the portal: host (remote loading) and remotes (data) look like one loader. */
export const SpinnerFallback = () => (
  <div style={{ display: 'grid', placeItems: 'center', minHeight: 160 }}>
    <Spinner />
  </div>
);
