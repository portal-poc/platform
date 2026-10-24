import Button from '@mui/joy/Button';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { Alert } from './Alert';
import { SpinnerFallback } from './Spinner';

type AsyncBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  renderError?: (props: FallbackProps) => ReactNode;
  /**
   * Called on retry. Apps pass `useQueryErrorResetBoundary().reset` here.
   * The DS is an MF singleton while TanStack Query is not, so the DS must not import react-query:
   * its QueryErrorResetBoundary context would belong to the host's copy, not the remote's.
   */
  onReset?: () => void;
  resetKeys?: unknown[];
};

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

const DefaultError = ({ error, resetErrorBoundary }: FallbackProps) => (
  <Alert color="danger" title="Something went wrong" endDecorator={<Button onClick={resetErrorBoundary}>Retry</Button>}>
    {describe(error)}
  </Alert>
);

/** ErrorBoundary + Suspense with the portal Spinner as the default fallback. */
export const AsyncBoundary = ({ children, fallback, renderError, onReset, resetKeys }: AsyncBoundaryProps) => (
  <ErrorBoundary fallbackRender={renderError ?? DefaultError} {...(onReset ? { onReset } : {})} {...(resetKeys ? { resetKeys } : {})}>
    <Suspense fallback={fallback ?? <SpinnerFallback />}>{children}</Suspense>
  </ErrorBoundary>
);
