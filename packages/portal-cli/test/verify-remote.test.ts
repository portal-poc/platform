import { describe, expect, it } from 'vitest';
import { verifyRemote } from '../src/commands/verify-remote.ts';
import type { RemoteManifest } from '../src/commands/verify-remote.ts';

const validManifest: RemoteManifest = {
  name: 'tasks',
  exposes: [{ path: './RemoteRoot' }, { path: './RemoteBridge' }, { path: './runtime' }, { path: './preload' }],
  shared: [
    { name: 'react', singleton: true, requiredVersion: '^19.3.0' },
    { name: 'react-dom', singleton: true, requiredVersion: '^19.3.0' },
    { name: 'react-router', singleton: true, requiredVersion: '^8.5.0' },
    { name: '@portal/ds', singleton: true, requiredVersion: '^1.0.0' },
  ],
};

const run = (manifest: RemoteManifest, extra: Partial<Parameters<typeof verifyRemote>[0]> = {}) =>
  verifyRemote({ manifest, contractPackageVersion: '1.0.0', mode: 'integrated', ...extra });

describe('verifyRemote', () => {
  it('accepts a remote that follows the integration contract', () => {
    expect(run(validManifest)).toEqual({ errors: [], warnings: [] });
  });

  it('fails when ./preload is removed', () => {
    const report = run({ ...validManifest, exposes: validManifest.exposes.filter((expose) => expose.path !== './preload') });
    expect(report.errors).toEqual(['expose "./preload" is missing (part of the integration contract).']);
  });

  it('fails when @tanstack/react-query is a singleton', () => {
    const report = run({
      ...validManifest,
      shared: [...validManifest.shared, { name: '@tanstack/react-query', singleton: true, requiredVersion: '^5.0.0' }],
    });
    expect(report.errors[0]).toMatch(/"@tanstack\/react-query" must NOT be a singleton/);
  });

  it('fails on non-singleton or incompatible React ranges', () => {
    const report = run({
      ...validManifest,
      shared: [{ name: 'react', singleton: false, requiredVersion: '^18.2.0' }, ...validManifest.shared.slice(1)],
    });
    expect(report.errors).toEqual([
      'shared "react" must be declared with singleton: true.',
      'shared "react" range ^18.2.0 does not intersect the host range ^19.3.0.',
    ]);
  });

  it('relaxes singleton requirements in bridge mode', () => {
    expect(run({ ...validManifest, name: 'legacy', shared: [] }, { mode: 'bridge' }).errors).toEqual([]);
  });

  it('checks the contract package range and warns about secrets and env-specific config', () => {
    const report = run(validManifest, {
      contractPackageVersion: '2.0.0',
      builtFiles: [['dist/a.js', 'const t = "Bearer abcdefghijklmnopqrstuvwxyz0123"']],
      runtimeConfig: { environments: {}, apiKey: 'x' },
    });
    expect(report.errors).toEqual(['@portal/platform-contract 2.0.0 is outside the supported range ^1.0.0.']);
    expect(report.warnings).toHaveLength(2);
  });
});
