import JoyAlert from '@mui/joy/Alert';
import type { AlertProps as JoyAlertProps } from '@mui/joy/Alert';
import Typography from '@mui/joy/Typography';
import type { ReactNode } from 'react';

type AlertProps = Omit<JoyAlertProps, 'title'> & { title: ReactNode };

/** Mirrors the real project's DS Alert: `title` is a prop. */
export const Alert = ({ title, children, ...rest }: AlertProps) => (
  <JoyAlert {...rest}>
    <div>
      <Typography level="title-sm">{title}</Typography>
      {children}
    </div>
  </JoyAlert>
);
