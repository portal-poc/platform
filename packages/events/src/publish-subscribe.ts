import type { z } from 'zod';
import type { PlatformContract } from '@portal-poc/platform-contract';
import type { PlatformEvent } from './define-event';

/** What the helpers need from the platform an app was mounted with. */
export type EventPlatform = Pick<PlatformContract, 'events' | 'telemetry'>;

/** A payload did not match the catalog schema: a bug in the publisher, or two apps on incompatible catalog versions. */
export class EventPayloadError extends Error {
  readonly event: string;
  readonly owner: string;
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(params: { event: PlatformEvent; direction: 'publish' | 'subscribe'; issues: readonly z.core.$ZodIssue[] }) {
    super(`${params.event.name}: ${params.direction === 'publish' ? 'refused to publish' : 'ignored'} a payload that does not match the catalog`);
    this.name = 'EventPayloadError';
    this.event = params.event.name;
    this.owner = params.event.owner;
    this.issues = params.issues;
  }
}

/** Validates, then emits. An invalid payload is reported to telemetry and not sent: subscribers never see it. */
export const publishEvent = <TSchema extends z.ZodType>(
  platform: EventPlatform,
  event: PlatformEvent<string, TSchema>,
  payload: z.input<TSchema>,
): void => {
  const parsed = event.schema.safeParse(payload);
  if (!parsed.success) {
    platform.telemetry.logError(new EventPayloadError({ event, direction: 'publish', issues: parsed.error.issues }));
    return;
  }
  platform.events.emit(event.name, parsed.data);
};

/**
 * Subscribes with the catalog schema: the listener gets a typed, validated payload; one that does not match (an older
 * or newer publisher broke the rules) is reported to telemetry and skipped. Returns the unsubscribe function.
 */
export const subscribeEvent = <TSchema extends z.ZodType>(
  platform: EventPlatform,
  event: PlatformEvent<string, TSchema>,
  listener: (payload: z.output<TSchema>) => void,
): (() => void) =>
  platform.events.subscribe(event.name, (payload) => {
    const parsed = event.schema.safeParse(payload);
    if (parsed.success) {
      listener(parsed.data);
    } else {
      platform.telemetry.logError(new EventPayloadError({ event, direction: 'subscribe', issues: parsed.error.issues }));
    }
  });
