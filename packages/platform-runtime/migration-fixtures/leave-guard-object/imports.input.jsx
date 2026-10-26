import { useLeaveGuard as useGuard } from '@portal-poc/platform-runtime';
import * as runtime from '@portal-poc/platform-runtime';
import { useLeaveGuard } from './local-guard';

const lockOptions = { lock: true, message: 'Saving…' };

export const Wizard = ({ step, saving }) => {
  useGuard(step > 1, { allows: (pathname) => pathname.startsWith('/wizard') });
  runtime.useLeaveGuard(!saving, lockOptions);
  useLeaveGuard(step, 'a local hook with the same name is not ours');
  return null;
};
