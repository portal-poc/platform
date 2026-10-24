import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import type { DevtoolsPanelEntry, DevtoolsRegistry } from './create-devtools-registry';
import { selectDevtoolsPanel } from './create-devtools-registry';
import { DEVTOOLS_PIN_STORAGE_KEY, readPinnedPanel, writePinnedPanel } from './pin-storage';

type DevtoolsToolbarProps = {
  registry: DevtoolsRegistry;
  hostName?: string;
  storageKey?: string;
  /** Extra status shown in the toolbar (e.g. auth mode). */
  extra?: ReactNode;
};

const AUTO_VALUE = '__auto__';

const styles = {
  toggle: {
    position: 'fixed',
    right: 12,
    bottom: 12,
    zIndex: 2147483000,
    font: '12px/1.2 system-ui, sans-serif',
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #8884',
    background: '#111c',
    color: '#fff',
    cursor: 'pointer',
  },
  drawer: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45vh',
    zIndex: 2147482999,
    display: 'flex',
    flexDirection: 'column',
    background: '#0b1018',
    borderTop: '1px solid #8886',
  },
  bar: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '6px 10px',
    font: '12px/1.2 system-ui, sans-serif',
    color: '#e6e9ef',
  },
  panelHost: { flex: 1, minHeight: 0 },
} satisfies Record<string, CSSProperties>;

const describePanel = (panel: DevtoolsPanelEntry, pinnedName: string | null): string => {
  const state = panel.mountCount > 0 ? '● mounted' : '○ loaded (cache alive until gcTime)';
  const pin = panel.name === pinnedName ? ' 📌' : '';
  return `${panel.name} — ${state}${pin}`;
};

const ensurePanelContainer = (host: HTMLElement): HTMLElement => {
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const existing = shadowRoot.querySelector<HTMLElement>('[data-devtools-panel]');
  if (existing) {
    return existing;
  }
  const container = document.createElement('div');
  container.dataset.devtoolsPanel = '';
  container.style.height = '100%';
  shadowRoot.append(container);
  return container;
};

/**
 * Own toggle + client selector + drawer with a shadow-root container. The floating TanStack button is not used:
 * every application, the host included, exposes a `*Panel` mount function.
 */
export const DevtoolsToolbar = ({
  registry,
  hostName = 'host',
  storageKey = DEVTOOLS_PIN_STORAGE_KEY,
  extra,
}: DevtoolsToolbarProps) => {
  const snapshot = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const [isOpen, setIsOpen] = useState(false);
  const [pinnedName, setPinnedName] = useState(() => readPinnedPanel(storageKey));
  const panelHostRef = useRef<HTMLDivElement>(null);

  const selectedName = selectDevtoolsPanel(snapshot, hostName, pinnedName);
  const selectedMount = snapshot.panels.find((panel) => panel.name === selectedName)?.mount;

  useEffect(() => {
    const host = panelHostRef.current;
    if (!isOpen || !host || !selectedMount) {
      return undefined;
    }
    return selectedMount(ensurePanelContainer(host));
  }, [isOpen, selectedMount]);

  const handleSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value === AUTO_VALUE ? null : event.target.value;
    setPinnedName(next);
    writePinnedPanel(storageKey, next);
  };

  const toggleOpen = () => {
    setIsOpen((open) => !open);
  };

  return (
    <>
      <button type="button" style={styles.toggle} onClick={toggleOpen} aria-expanded={isOpen}>
        {isOpen ? 'Close devtools' : `Devtools: ${selectedName ?? '—'}`}
      </button>
      {isOpen && (
        <section style={styles.drawer} aria-label="Query devtools">
          <div style={styles.bar}>
            <label>
              Client:{' '}
              <select value={pinnedName ?? AUTO_VALUE} onChange={handleSelect}>
                <option value={AUTO_VALUE}>Auto ({selectedName ?? '—'})</option>
                {snapshot.panels.map((panel) => (
                  <option key={panel.name} value={panel.name}>
                    {describePanel(panel, pinnedName)}
                  </option>
                ))}
              </select>
            </label>
            {extra}
          </div>
          <div ref={panelHostRef} style={styles.panelHost} />
        </section>
      )}
    </>
  );
};
