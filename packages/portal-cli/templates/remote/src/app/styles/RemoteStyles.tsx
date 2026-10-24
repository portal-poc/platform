import { GlobalStyles } from '@portal/ds';

/** Local view-transition classes (the host owns route-level transitions). 150–250 ms, off under reduced motion. */
const VIEW_TRANSITION_CSS = `
  ::view-transition-new(.__NAME__-item-enter) { animation: __NAME__-item-in 220ms ease-out both; }
  ::view-transition-old(.__NAME__-item-exit) { animation: __NAME__-item-out 150ms ease-in both; }
  @keyframes __NAME__-item-in { from { opacity: 0; transform: translateY(-8px); } }
  @keyframes __NAME__-item-out { to { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
  }
`;

export const RemoteStyles = () => <GlobalStyles styles={VIEW_TRANSITION_CSS} />;
