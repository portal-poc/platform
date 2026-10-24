import { queryOptions } from '@tanstack/react-query';
import type { HttpClient } from '@portal/platform-runtime';
import { itemListSchema } from './contracts';
import { remoteKeys } from './query-keys';

/** queryOptions factories in their own module: typed setQueryData via DataTag; reusable by a future `./preload`. */
export const itemsListOptions = (http: HttpClient) =>
  queryOptions({
    queryKey: remoteKeys.items(),
    queryFn: ({ signal }) => http.get('/items', itemListSchema, { signal }),
  });
