import semver from 'semver';

/**
 * Integration contract (section 5): fixed expose names, the minimal list of MF singletons with supported ranges,
 * and the supported platform-contract range. Checked by `portal-cli verify` and by the host at load time.
 * Single file on purpose: Node (portal-cli) imports it directly.
 */

export const REMOTE_EXPOSES = {
  RemoteRoot: './RemoteRoot',
  RemoteBridge: './RemoteBridge',
  runtime: './runtime',
  preload: './preload',
} as const;

export type RemoteExposeName = keyof typeof REMOTE_EXPOSES;

export const REQUIRED_EXPOSES: readonly string[] = Object.values(REMOTE_EXPOSES);

/**
 * Singletons only where object IDENTITY must match between the host tree and the remote tree
 * (React, router context, emotion/Joy theme context, DS). Ranges supported by the host.
 */
export const SINGLETONS = {
  react: '^19.3.0',
  'react-dom': '^19.3.0',
  'react-router': '^8.5.0',
  // Subpath with its own copy of the router internals: without sharing it, a RouterProvider from the remote's
  // `react-router/dom` and <Routes> from the shared `react-router` see different contexts (found in bridge mode).
  'react-router/dom': '^8.5.0',
  '@emotion/react': '^11.14.0',
  '@emotion/styled': '^11.14.0',
  '@mui/joy': '5.0.0-beta.52',
  '@portal-poc/ds': '^1.0.0',
} as const satisfies Record<string, string>;

/** Versioned packages bundled into every app. Declaring them as singletons fails `portal-cli verify`. */
export const NEVER_SINGLETONS: readonly string[] = [
  '@tanstack/react-query',
  'react-hook-form',
  'zod',
  '@portal-poc/platform-runtime',
];

export const SUPPORTED_CONTRACT_VERSIONS = { min: 1, max: 1 } as const;

/** `@portal-poc/platform-contract` npm range a remote may depend on. */
export const SUPPORTED_CONTRACT_PACKAGE_RANGE = '^1.0.0';

/** Remote names must be valid JS identifiers (MF global names) and lower-case. */
export const REMOTE_NAME_PATTERN = /^[a-z][a-z0-9]*$/;

/**
 * Bridge build variant: the same remote built WITHOUT shared dependencies (own React, router, DS), published next to
 * the main build. The host loads it when the main build is incompatible with the host's singletons.
 * Different MF name, so both variants can coexist in one page's share scope.
 */
export const BRIDGE_BUILD_SUFFIX = '_bridge';

export const toBridgeRemoteName = (name: string): string => `${name}${BRIDGE_BUILD_SUFFIX}`;

export type SharedEntry = {
  singleton: true;
  requiredVersion: string;
};

/** `shared` section for `@module-federation/vite`: exactly the singleton list, nothing else. */
export const createSharedConfig = (): Record<string, SharedEntry> =>
  Object.fromEntries(
    Object.entries(SINGLETONS).map(([name, requiredVersion]) => [name, { singleton: true, requiredVersion }]),
  );

/**
 * What a host deployment provides. Emitted by the host build as `compat.json` and published with every host deploy;
 * remotes are checked against it (release gate) and the host checks remote manifests against it at runtime.
 */
export type HostCompat = {
  hostVersion: string;
  contract: { min: number; max: number };
  /** Exact versions of the singletons the host provides. */
  singletons: Record<string, string>;
  /** Build tooling whose output (mf-manifest.json, remoteEntry.js) this host's MF runtime can load. */
  remoteTooling: { mfPlugin: string };
};

/**
 * Build tooling is a "build-time singleton": the manifest/remoteEntry format comes from the MF plugin, so every app
 * builds with a platform-approved range. Enforced by @portal-poc/vite-config (on config load), portal-cli verify/release
 * (manifest `metaData.pluginVersion`) and the host at runtime.
 */
export const SUPPORTED_BUILD_TOOLING = {
  vite: '~8.3.0',
  mfPlugin: '~1.23.0',
} as const;

export const findToolingProblem = (pluginVersion: string | undefined, supportedRange: string): string | null => {
  if (!pluginVersion) {
    return 'manifest has no metaData.pluginVersion (unknown build tooling)';
  }
  return semver.satisfies(pluginVersion, supportedRange)
    ? null
    : `built with @module-federation/vite ${pluginVersion}, supported ${supportedRange}`;
};

export type ManifestSharedEntry = { name: string; singleton?: boolean; requiredVersion?: string };

export type SingletonConflict = { name: string; required: string; provided: string | null };

/**
 * Singletons the remote requires that the host does not provide in a satisfying version.
 * (MF with `singleton: true` would silently hand the remote the host's copy anyway.)
 */
export const findSingletonConflicts = (
  shared: readonly ManifestSharedEntry[],
  provided: Readonly<Record<string, string>>,
): SingletonConflict[] =>
  shared
    .filter((entry) => entry.singleton && entry.requiredVersion && entry.name in SINGLETONS)
    .flatMap((entry) => {
      const required = entry.requiredVersion ?? '*';
      const version = provided[entry.name] ?? null;
      return version && semver.satisfies(version, required) ? [] : [{ name: entry.name, required, provided: version }];
    });

export const describeConflict = (conflict: SingletonConflict): string =>
  `${conflict.name}: remote requires ${conflict.required}, host provides ${conflict.provided ?? 'nothing'}`;
