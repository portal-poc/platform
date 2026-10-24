import { extendTheme } from '@mui/joy/styles';

/** Joy theme on CSS variables: visual consistency rests on tokens (`--joy-*`), not only on a shared DS major. */
export const portalTheme = extendTheme({
  fontFamily: { body: 'Inter, system-ui, sans-serif', display: 'Inter, system-ui, sans-serif' },
  colorSchemes: {
    light: { palette: { primary: { solidBg: '#1f5eff', solidHoverBg: '#174ad1' } } },
  },
});
