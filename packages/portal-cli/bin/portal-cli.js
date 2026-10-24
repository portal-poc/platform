#!/usr/bin/env node
// Runs the TypeScript sources directly (Node >= 22.18 type stripping).
// TODO(decision): compile to JS before publishing to Nexus (Node refuses to strip types inside node_modules).
import '../src/main.ts';
