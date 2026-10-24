# ADR 0016: Lint stack: oxlint + Steiger + fallow

## Context

React Compiler is on everywhere; manual memoization is banned; dead code accumulates across many repos.

## Decision

`@portal/presets` ships: oxlint (style rules from the requirements + native React Compiler rules: purity, refs, immutability, set-state-in-render/effect, static-components, ...), Steiger (FSD), fallow (unused files/exports/dependencies, duplication, FSD boundaries). Apps extend presets or inline them (CLI choice).

## Consequences

fallow found real issues while building this repo (runtime dependency declared as dev dependency, dead exports in public APIs).
