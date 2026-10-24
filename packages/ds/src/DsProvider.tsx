import CssBaseline from '@mui/joy/CssBaseline';
import { CssVarsProvider } from '@mui/joy/styles';
import type { ReactNode } from 'react';
import { portalTheme } from './theme';

/** Rendered once by the host (and by a remote only in standalone / bridge mode — its own React root). */
export const DsProvider = ({ children }: { children: ReactNode }) => (
  <CssVarsProvider theme={portalTheme} defaultMode="light">
    <CssBaseline />
    {children}
  </CssVarsProvider>
);
