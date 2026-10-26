import type { Migration } from '@portal-poc/cli/migrations';
import { leaveGuardObject } from './leave-guard-object.js';

/**
 * Run in apps by `portal-cli upgrade` (and `migrate`) after they bump this package, in version order.
 * Add one with `portal-cli migration create <id>` — never edit or remove a released migration.
 */
export const migrations: readonly Migration[] = [leaveGuardObject];
