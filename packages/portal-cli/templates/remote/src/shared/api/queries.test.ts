import { describe, expect, it } from 'vitest';
import { createHttpClient, createMockPlatformAuth, createPortalQueryClient } from '@portal-poc/platform-runtime';
import { fakeBackendFetch } from './fake-backend';
import { itemsListOptions } from './queries';

/** The data layer without React: the real http client (bearer token, zod parsing) against the fake backend. */
describe('itemsListOptions', () => {
  it('loads and validates the item list', async () => {
    const http = createHttpClient({
      baseUrl: 'https://__NAME__-bff.test/api',
      scopes: ['api://__NAME__-bff/__TITLE__.ReadWrite'],
      auth: createMockPlatformAuth(),
      fetch: fakeBackendFetch,
    });

    const items = await createPortalQueryClient().fetchQuery(itemsListOptions(http));

    expect(items.map((item) => item.title)).toEqual(['First item', 'Second item']);
  });
});
