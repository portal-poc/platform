import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockPlatformAuth, createPortalQueryClient, createStandalonePlatform } from '@portal-poc/platform-runtime';
import { REMOTE_NAME } from '../config';
import { remotePlatform } from './http';
import { itemsListOptions } from './queries';

/** The data layer without React: the real axios client (bearer token, zod parsing) against the fake backend. */
describe('itemsListOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads and validates the item list', async () => {
    // The runtime config this test environment gets (public/config.json in the app).
    const config = { environments: { test: { bffBaseUrl: 'https://__NAME__-bff.test/api', scopes: ['s'], fakeBackend: true } } };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(config)));
    remotePlatform.bind(
      createStandalonePlatform({
        appName: REMOTE_NAME,
        env: { name: 'test', hostOrigin: 'http://localhost' },
        auth: createMockPlatformAuth(),
        devtools: false,
      }).platform,
    );

    const items = await createPortalQueryClient().fetchQuery(itemsListOptions());

    expect(items.map((item) => item.title)).toEqual(['First item', 'Second item']);
  });
});
