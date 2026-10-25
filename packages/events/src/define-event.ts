import type { z } from 'zod';

/** One entry of the catalog: the bus name, the team that owns the payload, the payload schema. */
export type PlatformEvent<TName extends string = string, TSchema extends z.ZodType = z.ZodType> = {
  readonly name: TName;
  /** The publishing team: it reviews every change of the payload. Logged with invalid payloads. */
  readonly owner: string;
  readonly schema: TSchema;
};

export type EventPayload<TEvent extends PlatformEvent> = z.output<TEvent['schema']>;

export const defineEvent = <TName extends string, TSchema extends z.ZodType>(
  name: TName,
  owner: string,
  schema: TSchema,
): PlatformEvent<TName, TSchema> => ({ name, owner, schema });
