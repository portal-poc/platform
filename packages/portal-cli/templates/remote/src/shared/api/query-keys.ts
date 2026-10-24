/** Namespace first (`__NAME__`), then domain scope — readable in devtools. */
export const remoteKeys = {
  all: ['__NAME__'] as const,
  items: () => [...remoteKeys.all, 'items'] as const,
};
