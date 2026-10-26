import { useLeaveGuard } from '@portal-poc/platform-runtime';

export const TaskForm = ({ dirty, saving, status }) => {
  const unsaved = useLeaveGuard({ when: dirty, dialog: 'own', message: 'The task is not saved.' });
  useLeaveGuard({ when: status === 'saving' });
  useLeaveGuard({
    when: saving,
    lock: true,
    message: 'Saving…',
    allows: (pathname) => pathname.startsWith('/tasks/new'),
  });
  useLeaveGuard({ when: dirty, message: 'Already migrated' });
  return unsaved.state === 'asking' ? <p>Leave?</p> : null;
};
