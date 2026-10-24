import semver from 'semver';
import type { HostCompat } from '@portal/mf-shared';
import {
  BRIDGE_BUILD_SUFFIX,
  describeConflict,
  findSingletonConflicts,
  NEVER_SINGLETONS,
  REMOTE_NAME_PATTERN,
  REQUIRED_EXPOSES,
  SINGLETONS,
  SUPPORTED_CONTRACT_PACKAGE_RANGE,
} from '@portal/mf-shared';

export type VerifyMode = 'integrated' | 'bridge';

export type ManifestShared = { name: string; singleton?: boolean; requiredVersion?: string };

export type RemoteManifest = {
  name: string;
  exposes: ReadonlyArray<{ path: string }>;
  shared: readonly ManifestShared[];
};

export type VerifyInput = {
  manifest: RemoteManifest;
  /** Resolved version of @portal/platform-contract installed in the remote, or null if missing. */
  contractPackageVersion: string | null;
  mode: VerifyMode;
  /** Text of built files to scan for secrets: [path, content]. */
  builtFiles?: ReadonlyArray<readonly [string, string]>;
  /** Parsed dist/config.json, if any. */
  runtimeConfig?: unknown;
  /** What the target host deployment provides (its compat.json). Checks exact versions instead of ranges. */
  hostCompat?: HostCompat;
};

export type VerifyReport = { errors: string[]; warnings: string[] };

/** Singletons a remote must declare in integrated mode (the rest only if it uses them). */
const REQUIRED_SINGLETONS = ['react', 'react-dom', 'react-router'];

const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/],
  ['mock token', /mock\.[A-Za-z0-9_-]{40,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['bearer literal', /Bearer [A-Za-z0-9._-]{20,}/],
];

const checkSingletons = (shared: readonly ManifestShared[], mode: VerifyMode, errors: string[]) => {
  const byName = new Map(shared.map((entry) => [entry.name, entry]));
  for (const [name, hostRange] of Object.entries(SINGLETONS)) {
    const entry = byName.get(name);
    if (!entry) {
      if (mode === 'integrated' && REQUIRED_SINGLETONS.includes(name)) {
        errors.push(`shared "${name}" is missing: it must be a singleton (range compatible with ${hostRange}).`);
      }
      continue;
    }
    if (mode === 'integrated' && entry.singleton !== true) {
      errors.push(`shared "${name}" must be declared with singleton: true.`);
    }
    if (entry.requiredVersion && !semver.intersects(entry.requiredVersion, hostRange)) {
      errors.push(`shared "${name}" range ${entry.requiredVersion} does not intersect the host range ${hostRange}.`);
    }
  }
  for (const name of NEVER_SINGLETONS) {
    if (byName.get(name)?.singleton) {
      errors.push(`"${name}" must NOT be a singleton: it is a versioned package bundled into every app.`);
    }
  }
};

const checkRuntimeConfig = (config: unknown, warnings: string[]) => {
  if (typeof config !== 'object' || config === null) {
    return;
  }
  const extraKeys = Object.keys(config).filter((key) => key !== 'environments');
  if (extraKeys.length > 0) {
    warnings.push(`config.json has keys outside the template (${extraKeys.join(', ')}): keep the build environment-agnostic.`);
  }
};

/** Integration-contract check (section 17.1). Pure: the command reads files, this decides. */
export const verifyRemote = (input: VerifyInput): VerifyReport => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { manifest } = input;

  const baseName = input.mode === 'bridge' ? manifest.name.replace(new RegExp(`${BRIDGE_BUILD_SUFFIX}$`), '') : manifest.name;
  if (!REMOTE_NAME_PATTERN.test(baseName)) {
    errors.push(`remote name "${manifest.name}" does not match ${REMOTE_NAME_PATTERN}.`);
  }
  const exposed = new Set(manifest.exposes.map((expose) => expose.path));
  for (const expose of REQUIRED_EXPOSES) {
    if (!exposed.has(expose)) {
      errors.push(`expose "${expose}" is missing (part of the integration contract).`);
    }
  }
  checkSingletons(manifest.shared, input.mode, errors);
  if (input.hostCompat && input.mode === 'integrated') {
    for (const conflict of findSingletonConflicts(manifest.shared, input.hostCompat.singletons)) {
      errors.push(`incompatible with host ${input.hostCompat.hostVersion}: ${describeConflict(conflict)}.`);
    }
  }

  if (!input.contractPackageVersion) {
    errors.push('@portal/platform-contract is not installed.');
  } else if (!semver.satisfies(input.contractPackageVersion, SUPPORTED_CONTRACT_PACKAGE_RANGE)) {
    errors.push(
      `@portal/platform-contract ${input.contractPackageVersion} is outside the supported range ${SUPPORTED_CONTRACT_PACKAGE_RANGE}.`,
    );
  }

  for (const [path, content] of input.builtFiles ?? []) {
    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        warnings.push(`${path} looks like it contains a ${label}.`);
      }
    }
  }
  checkRuntimeConfig(input.runtimeConfig, warnings);
  return { errors, warnings };
};
