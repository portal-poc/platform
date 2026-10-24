import Button from '@mui/joy/Button';
import type { ButtonProps } from '@mui/joy/Button';
import { Spinner } from './Spinner';

type AsyncButtonProps = ButtonProps & { isPending: boolean };

/**
 * Disabled IMMEDIATELY (no double submit in the first 300 ms) but keeps its normal look; the spinner appears after
 * `--pending-button-delay`. Label and spinner share one grid cell, so the width never jumps.
 */
export const AsyncButton = ({ isPending, disabled, children, sx, ...rest }: AsyncButtonProps) => (
  <Button
    {...rest}
    disabled={isPending || disabled}
    data-pending={isPending ? '' : undefined}
    sx={[
      (theme) => ({
        '--pending-button-delay': '300ms',
        '&[data-pending]': {
          ...theme.variants[rest.variant ?? 'solid']?.[rest.color ?? 'primary'],
          cursor: 'progress',
        },
        '& [data-layer]': { gridArea: '1 / 1', transition: 'opacity 120ms' },
        '& [data-layer="spinner"]': { opacity: 0, display: 'grid', placeItems: 'center' },
        '&[data-pending] [data-layer="spinner"]': { opacity: 1, transitionDelay: 'var(--pending-button-delay)' },
        '&[data-pending] [data-layer="label"]': { opacity: 0, transitionDelay: 'var(--pending-button-delay)' },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    <span style={{ display: 'grid' }}>
      <span data-layer="label">{children}</span>
      <span data-layer="spinner" aria-hidden>
        <Spinner delay={0} size="sm" />
      </span>
    </span>
  </Button>
);
