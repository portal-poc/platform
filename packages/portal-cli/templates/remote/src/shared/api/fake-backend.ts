import type { Item } from './contracts';

/**
 * Placeholder backend: a fake `fetch` injected into the real http client (bearer + zod still run).
 * Replace with the real BFF by removing the `fetch` option in `http-client.ts`.
 */
const items: Item[] = [
  { id: '1', title: 'First item' },
  { id: '2', title: 'Second item' },
];

export const fakeBackendFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  const body = new URL(request.url).pathname.endsWith('/items') ? items : { error: 'not found' };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
};
