import { z } from 'zod';
import { defineEvent } from './define-event';

/*
 * The catalog: every event that crosses application boundaries on `platform.events`. The publisher and the
 * subscribers are deployed independently (any version pair can meet on a stand), so an event is a public API:
 *
 * - names are `<domain>.<what happened>` in the past tense; the owner is the team that publishes it;
 * - payload changes are additive only: a new OPTIONAL field. Subscribers ignore fields they do not know;
 * - anything else (remove, rename, retype, make required) is a NEW event `<name>.v2`: the publisher emits both until
 *   no stand runs a subscriber of the old one, then the old entry is removed in a major release of this package;
 * - payloads carry ids and hints, never the data itself: the subscriber refetches from its BFF.
 */

/** A user bookmarked or un-bookmarked something; the host's bookmarks widget refetches. */
export const bookmarksChanged = defineEvent(
  'bookmarks.changed',
  'tasks',
  z.object({
    /** The publishing app (`REMOTE_NAME`). */
    source: z.string(),
    /** Sent with the BFF call as `X-Correlation-Id`: links the event to the request in logs. */
    correlationId: z.string().optional(),
  }),
);
