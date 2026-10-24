# ADR 0012: API contracts codegen — out of scope

## Context

The backend's shared OpenAPI repo and codegen are already settled.

## Decision

Not implemented here. Each app keeps hand-written zod schemas in exactly one file (`shared/api/contracts.ts`) and validates every response, so switching to a generated package touches one place.

## Consequences

Scenario 17 not covered.
