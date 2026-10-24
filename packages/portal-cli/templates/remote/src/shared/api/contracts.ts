import { z } from 'zod';

/**
 * The single place where __NAME__-bff types/schemas live. Hand-written now; later a re-export from the backend's
 * generated package — only this file changes. Responses are validated (trust boundary) either way.
 */
const itemSchema = z.object({ id: z.string(), title: z.string() });

export const itemListSchema = z.array(itemSchema);

export type Item = z.output<typeof itemSchema>;
