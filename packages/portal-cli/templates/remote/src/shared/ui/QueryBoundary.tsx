import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AsyncBoundary } from '@portal/ds';

/** DS AsyncBoundary wired to THIS app's react-query copy (the DS singleton must not import react-query). */
export const QueryBoundary = ({ children }: { children: ReactNode }) => {
  const { reset } = useQueryErrorResetBoundary();
  return <AsyncBoundary onReset={reset}>{children}</AsyncBoundary>;
};
