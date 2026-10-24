import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { PlatformAuthEvent } from '@portal/platform-contract';
import { createMockPlatformAuth } from './create-mock-platform-auth';
import { createRemoteAuth } from './create-remote-auth';
import { PlatformInteractionRequiredError, PlatformScopeNotAllowedError } from './errors';
import { clearQueryClientForAccountChange } from './use-clear-cache-on-account-change';

const decodePayload = (token: string): Record<string, unknown> =>
  JSON.parse(atob(token.slice('mock.'.length).replaceAll('-', '+').replaceAll('_', '/')));

describe('createMockPlatformAuth', () => {
  it('issues opaque tokens with exp and caches them until close to expiry', async () => {
    let now = 1_000_000;
    const auth = createMockPlatformAuth({ tokenTtlMs: 60_000, now: () => now });

    const first = await auth.getAccessToken(['api://tasks/Tasks.ReadWrite']);
    expect(decodePayload(first)).toMatchObject({ sub: 'alice', exp: Math.floor((1_000_000 + 60_000) / 1000) });
    expect(await auth.getAccessToken(['api://tasks/Tasks.ReadWrite'])).toBe(first);

    now += 50_000; // inside the refresh margin (25% of TTL)
    expect(await auth.getAccessToken(['api://tasks/Tasks.ReadWrite'])).not.toBe(first);
  });

  it('emits login / logout / account-changed and requires interaction when signed out', async () => {
    const auth = createMockPlatformAuth();
    const events: PlatformAuthEvent[] = [];
    auth.subscribe((event) => events.push(event));

    auth.switchAccount('bob');
    auth.logout();
    await expect(auth.getAccessToken(['s'])).rejects.toBeInstanceOf(PlatformInteractionRequiredError);
    await auth.requestInteraction(['s']);

    expect(events.map((event) => event.type)).toEqual(['account-changed', 'logout', 'login']);
    expect(auth.getAccount()?.id).toBe('alice');
  });
});

describe('createRemoteAuth', () => {
  it('rejects scopes outside the allowlist with a clear error reported to telemetry', async () => {
    const telemetry = { logError: vi.fn(), trackEvent: vi.fn() };
    const auth = createRemoteAuth(createMockPlatformAuth(), 'tasks', ['api://tasks/Tasks.ReadWrite'], { telemetry });

    await expect(auth.getAccessToken(['api://host/Host.Admin'])).rejects.toThrow(
      /Remote "tasks" requested scope\(s\) outside of its allowlist: api:\/\/host\/Host\.Admin/,
    );
    await expect(auth.getAccessToken(['api://host/Host.Admin'])).rejects.toBeInstanceOf(PlatformScopeNotAllowedError);
    expect(telemetry.logError).toHaveBeenCalledWith(expect.any(PlatformScopeNotAllowedError), {
      remoteName: 'tasks',
      rejectedScopes: ['api://host/Host.Admin'],
    });
  });

  it('forwards interaction to the host instead of running it', async () => {
    const base = createMockPlatformAuth({ initialAccountId: null });
    const requestInteraction = vi.spyOn(base, 'requestInteraction');
    const auth = createRemoteAuth(base, 'tasks', ['s']);

    await expect(auth.getAccessToken(['s'])).rejects.toBeInstanceOf(PlatformInteractionRequiredError);
    expect(requestInteraction).toHaveBeenCalledWith(['s']);
  });
});

describe('clearQueryClientForAccountChange', () => {
  it('removes inactive queries and resets data of the rest', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tasks', 'list'], ['a']);

    clearQueryClientForAccountChange(queryClient);

    expect(queryClient.getQueryData(['tasks', 'list'])).toBeUndefined();
  });
});
