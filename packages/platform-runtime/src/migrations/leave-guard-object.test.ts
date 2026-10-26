// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyMigration, loadFixtures } from '@portal-poc/cli/migrations';
import { leaveGuardObject } from './leave-guard-object.js';

// One input/output pair per situation, each in .tsx and .jsx (apps may be JS): migration-fixtures/leave-guard-object/.
describe(`migration ${leaveGuardObject.id}`, () => {
  it.each(loadFixtures(new URL('../../migration-fixtures/leave-guard-object/', import.meta.url)))('$name', async (fixture) => {
    const result = await applyMigration(leaveGuardObject, { [fixture.file]: fixture.input });
    expect(result.files[fixture.file]).toBe(fixture.output);
    expect(result.manual.map((step) => step.note)).toEqual(fixture.manual);
    // Idempotent: the migrated code is left as it is.
    expect((await applyMigration(leaveGuardObject, result.files)).changed).toEqual([]);
  });
});
