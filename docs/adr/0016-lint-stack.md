# ADR 0016: Lint stack: oxlint + Steiger + fallow

## Context

React Compiler is on everywhere; manual memoization is banned; dead code accumulates across many repos.

## Decision

`@portal-poc/presets` ships: oxlint (style rules from the requirements + native React Compiler rules: purity, refs, immutability, set-state-in-render/effect, static-components, ...), Steiger (FSD), fallow (unused files/exports/dependencies, duplication). FSD import boundaries are Steiger's (`fsd/forbidden-imports`): fallow's `feature-sliced` boundary preset duplicated them and warned about every optional layer a remote does not have. Apps extend presets or inline them (CLI choice).

## Consequences

fallow found real issues while building this repo (runtime dependency declared as dev dependency, dead exports in public APIs).
