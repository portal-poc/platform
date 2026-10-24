import type { PlatformTelemetry } from '@portal-poc/platform-contract';

export type TelemetryRecord =
  | { kind: 'error'; app: string; error: unknown; context?: Readonly<Record<string, unknown>>; at: number }
  | { kind: 'event'; app: string; name: string; properties?: Readonly<Record<string, unknown>>; at: number };

type ConsoleTelemetryOptions = {
  app: string;
  /** Optional sink (the host demo panel shows the latest records). */
  onRecord?: (record: TelemetryRecord) => void;
};

/** Demo telemetry: console + optional sink. The real project plugs Application Insights (or similar) here. */
export const createConsoleTelemetry = ({ app, onRecord }: ConsoleTelemetryOptions): PlatformTelemetry => ({
  logError: (error, context) => {
    console.error(`[telemetry:${app}]`, error, context ?? {});
    onRecord?.({ kind: 'error', app, error, ...(context ? { context } : {}), at: Date.now() });
  },
  trackEvent: (name, properties) => {
    console.info(`[telemetry:${app}] ${name}`, properties ?? {});
    onRecord?.({ kind: 'event', app, name, ...(properties ? { properties } : {}), at: Date.now() });
  },
});
