import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, Link, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformContract, PlatformNavigation } from '@portal-poc/platform-contract';
import { PlatformProvider } from '../provider/PlatformProvider';
import { PlatformLeaveBlocker } from '../router/PlatformLeaveBlocker';
import { createLeaveGuards } from './create-leave-guards';
import { useLeaveGuard } from './use-leave-guard';
import type { LeaveGuardOptions } from './use-leave-guard';
import { usePageTitle } from './use-page-title';

const createNavigation = (answer = false) => {
  const ask = vi.fn(async () => answer);
  const notifyLocked = vi.fn();
  return { navigation: createLeaveGuards({ ask, notifyLocked }), ask, notifyLocked };
};

describe('createLeaveGuards', () => {
  it('asks every blocking guard in turn, skipping guards that allow the target', async () => {
    const { navigation, ask } = createNavigation(true);
    const own = vi.fn(async () => true);
    navigation.guard({ message: 'host form' });
    navigation.guard({ message: 'remote form', confirm: own });
    navigation.guard({ message: 'wizard', allows: (pathname) => pathname.startsWith('/tasks/new') });

    expect(navigation.isBlocked('/tasks/new/2')).toBe(true);
    await expect(navigation.confirmLeave('/tasks/new/2')).resolves.toBe(true);
    expect(ask).toHaveBeenCalledOnce();
    expect(own).toHaveBeenCalledWith('/tasks/new/2');
  });

  it('refuses with the lock notice, without asking anyone', async () => {
    const { navigation, ask, notifyLocked } = createNavigation(true);
    navigation.guard({ message: 'unsaved' });
    navigation.guard({ message: 'Saving…', lock: true });

    await expect(navigation.confirmLeave('/')).resolves.toBe(false);
    expect(notifyLocked).toHaveBeenCalledWith('Saving…');
    expect(ask).not.toHaveBeenCalled();
  });

  it('shares one decision between routers that see the same navigation, and unblocks on release', async () => {
    const { navigation, ask } = createNavigation(false);
    const release = navigation.guard({ message: 'unsaved' });

    const [first, second] = await Promise.all([navigation.confirmLeave('/'), navigation.confirmLeave('/')]);
    expect([first, second]).toEqual([false, false]);
    expect(ask).toHaveBeenCalledOnce();

    release();
    expect(navigation.isBlocked('/')).toBe(false);
  });
});

const platformWith = (navigation: PlatformNavigation, setTitle = vi.fn()) =>
  ({ navigation, document: { setTitle } }) as unknown as PlatformContract;

type FormPageProps = { dirty: boolean; options?: LeaveGuardOptions };

const FormPage = ({ dirty, options }: FormPageProps) => {
  usePageTitle('New task');
  const leave = useLeaveGuard(dirty, options);
  return (
    <>
      <Link to="/home">Home</Link>
      {leave.state === 'asking' && (
        <dialog open>
          Leave for {leave.pathname}?
          <button type="button" onClick={leave.leave}>
            Discard
          </button>
          <button type="button" onClick={leave.stay}>
            Stay
          </button>
        </dialog>
      )}
    </>
  );
};

/** A data router like the host's: the blocker in the layout, the app's page below. */
const renderApp = (platform: PlatformContract, page: ReactNode) => {
  const router = createMemoryRouter(
    [
      {
        element: (
          <PlatformProvider value={platform}>
            <PlatformLeaveBlocker platform={platform} />
            <Outlet />
          </PlatformProvider>
        ),
        children: [
          { path: '/form', element: page },
          { path: '/home', element: <p>Home page</p> },
        ],
      },
    ],
    { initialEntries: ['/form'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

describe('useLeaveGuard + PlatformLeaveBlocker', () => {
  afterEach(cleanup);

  it('blocks a link while dirty and lets it through after the host dialog says leave', async () => {
    const { navigation, ask } = createNavigation(true);
    const router = renderApp(platformWith(navigation), <FormPage dirty options={{ message: 'Not saved' }} />);

    await act(async () => screen.getByText('Home').click());

    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ message: 'Not saved' }), '/home');
    expect(router.state.location.pathname).toBe('/home');
  });

  it('keeps the page when the host dialog says stay', async () => {
    const { navigation } = createNavigation(false);
    const router = renderApp(platformWith(navigation), <FormPage dirty />);

    await act(async () => screen.getByText('Home').click());

    expect(router.state.location.pathname).toBe('/form');
  });

  it("waits for the app's own dialog", async () => {
    const { navigation, ask } = createNavigation(true);
    const router = renderApp(platformWith(navigation), <FormPage dirty options={{ dialog: 'own' }} />);

    await act(async () => screen.getByText('Home').click());
    expect(screen.getByRole('dialog').textContent).toContain('Leave for /home?');
    expect(router.state.location.pathname).toBe('/form');

    await act(async () => screen.getByText('Discard').click());
    expect(router.state.location.pathname).toBe('/home');
    expect(ask).not.toHaveBeenCalled();
  });

  it('does not block a clean page, and sets and clears the page title', async () => {
    const { navigation, ask } = createNavigation(false);
    const setTitle = vi.fn();
    const router = renderApp(platformWith(navigation, setTitle), <FormPage dirty={false} />);
    expect(setTitle).toHaveBeenLastCalledWith('New task');

    await act(async () => screen.getByText('Home').click());

    expect(ask).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/home');
    expect(setTitle).toHaveBeenLastCalledWith(null);
  });
});
