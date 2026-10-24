import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { QueryClient } from '@tanstack/react-query';
import type { MountDevtoolsPanel } from '@portal-poc/platform-contract';

const findShadowRoot = (container: HTMLElement): ShadowRoot | undefined => {
  const root = container.getRootNode();
  return root instanceof ShadowRoot ? root : undefined;
};

/**
 * Mount function for this application's TanStack Query devtools.
 * - The devtools chunk is imported lazily inside `mount` (separate chunk, loaded only when the panel opens).
 * - Rendered into a SEPARATE React root in the container: no integration with the host tree is needed, and a bridge
 *   remote with another React version works the same way.
 * - `shadowDOMTarget` isolates styles of different devtools versions.
 */
export const createQueryDevtoolsMount =
  (client: QueryClient): MountDevtoolsPanel =>
  (container) => {
    let disposed = false;
    let root: Root | null = null;

    const render = async () => {
      const { ReactQueryDevtoolsPanel } = await import('@tanstack/react-query-devtools/production');
      if (disposed) {
        return;
      }
      root = createRoot(container);
      const shadowDOMTarget = findShadowRoot(container);
      root.render(
        createElement(ReactQueryDevtoolsPanel, {
          client,
          style: { height: '100%', width: '100%' },
          ...(shadowDOMTarget ? { shadowDOMTarget } : {}),
        }),
      );
    };

    void render();

    return () => {
      disposed = true;
      const mountedRoot = root;
      root = null;
      // Unmounting synchronously while another root is rendering triggers a React warning.
      queueMicrotask(() => {
        mountedRoot?.unmount();
      });
    };
  };
