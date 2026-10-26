import { useLeaveGuard } from '@portal-poc/platform-runtime';

export const Page = (props) => {
  const args = [props.dirty, { message: 'Not saved' }];
  useLeaveGuard(...args);
  useLeaveGuard(props.guard);
  return null;
};
