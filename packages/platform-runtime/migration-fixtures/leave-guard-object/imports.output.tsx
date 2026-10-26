import { useLeaveGuard as useGuard } from '@portal-poc/platform-runtime';
import * as runtime from '@portal-poc/platform-runtime';
import { useLeaveGuard } from './local-guard';

const lockOptions = { lock: true, message: 'Saving…' };

export const Wizard = ({ step, saving }: { step: number; saving: boolean }) => {
  useGuard({ when: step > 1, allows: (pathname: string) => pathname.startsWith('/wizard') });
  runtime.useLeaveGuard({ when: !saving, ...lockOptions });
  useLeaveGuard(step, 'a local hook with the same name is not ours');
  return null;
};
