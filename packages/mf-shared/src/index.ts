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
  '@emotion/react': '^11.14.0',
  '@emotion/styled': '^11.14.0',
  '@mui/joy': '5.0.0-beta.52',
  '@portal/ds': '^1.0.0',
} as const satisfies Record<string, string>;

/** Versioned packages bundled into every app. Declaring them as singletons fails `portal-cli verify`. */
export const NEVER_SINGLETONS: readonly string[] = [
  '@tanstack/react-query',
  'react-hook-form',
  'zod',
  '@portal/platform-runtime',
];

export const SUPPORTED_CONTRACT_VERSIONS = { min: 1, max: 1 } as const;

/** `@portal/platform-contract` npm range a remote may depend on. */
export const SUPPORTED_CONTRACT_PACKAGE_RANGE = '^1.0.0';

/** Remote names must be valid JS identifiers (MF global names) and lower-case. */
export const REMOTE_NAME_PATTERN = /^[a-z][a-z0-9]*$/;

export type SharedEntry = {
  singleton: true;
  requiredVersion: string;
};

/** `shared` section for `@module-federation/vite`: exactly the singleton list, nothing else. */
export const createSharedConfig = (): Record<string, SharedEntry> =>
  Object.fromEntries(
    Object.entries(SINGLETONS).map(([name, requiredVersion]) => [name, { singleton: true, requiredVersion }]),
  );
