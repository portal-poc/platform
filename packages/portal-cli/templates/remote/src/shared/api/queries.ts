import { queryOptions } from '@tanstack/react-query';
import { parseResponse } from '@portal-poc/http';
import { itemListSchema } from './contracts';
import { http } from './http';
import { remoteKeys } from './query-keys';

/** queryOptions factories in their own module: typed setQueryData via DataTag; reusable by a future `./preload`. */
export const itemsListOptions = () =>
  queryOptions({
    queryKey: remoteKeys.items(),
    queryFn: ({ signal }) => http.get('/items', { signal }).then(parseResponse(itemListSchema)),
  });
