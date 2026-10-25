import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { federation } from '@module-federation/vite';
import {
  createSharedConfig,
  REMOTE_EXPOSES,
  SUPPORTED_BUILD_TOOLING,
  toBridgeRemoteName,
} from '@portal-poc/mf-shared';
import type { SharedEntry } from '@portal-poc/mf-shared';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import semver from 'semver';
import { defineConfig, mergeConfig } from 'vite';
import type { PluginOption, UserConfig, UserConfigFnPromise } from 'vite';

type PackageJson = { version: string };

const readJson = (path: string): PackageJson => JSON.parse(readFileSync(path, 'utf8'));

/** Resolves an installed package version from the app's point of view. */
const installedVersion = (appRoot: string, name: string): string => {
  const require = createRequire(`${appRoot}/package.json`);
  return readJson(require.resolve(`${name}/package.json`)).version;
};

const git = (dir: string, args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * The commit a build was made from, recorded in every artifact (remote manifests, the host's compat.json): a version
 * like `1.5.3-rc.2` names a deploy, not a commit, and the release branch moves on. `-dirty` when the working tree had
 * uncommitted changes (a local build); undefined outside git.
 */
export const gitCommitOf = (dir: string): string | undefined => {
  try {
    const sha = git(dir, ['rev-parse', 'HEAD']);
    return git(dir, ['status', '--porcelain', '--untracked-files=no']) ? `${sha}-dirty` : sha;
  } catch {
    return undefined;
  }
};

/**
 * Build tooling is a build-time singleton: another Vite/MF plugin version can emit a manifest the host's MF runtime
 * cannot load. Fail the build early with a clear message instead.
 */
const assertBuildTooling = (appRoot: string) => {
  const checks = [
    ['vite', SUPPORTED_BUILD_TOOLING.vite],
    ['@module-federation/vite', SUPPORTED_BUILD_TOOLING.mfPlugin],
  ] as const;
  for (const [name, range] of checks) {
    const version = installedVersion(appRoot, name);
    if (!semver.satisfies(version, range)) {
      throw new Error(
        `${name}@${version} is outside the platform-supported range ${range}. ` +
          'Build tooling is upgraded together with @portal-poc/vite-config, not per app.',
      );
    }
  }
};

const resolveExpose = (appRoot: string, exposesDir: string, file: string): string => {
  const candidates = [`${exposesDir}/${file}.tsx`, `${exposesDir}/${file}.ts`];
  const found = candidates.find((candidate) => existsSync(`${appRoot}/${candidate}`));
  if (!found) {
    throw new Error(`Expose "${file}" not found in ${exposesDir} (integration contract).`);
  }
  return `./${found}`;
};

export type RemoteViteOptions = {
  /** MF name of the remote (integration contract). */
  name: string;
  port: number;
  /** `import.meta.url` of the app's vite.config.ts. */
  configUrl: string;
  /** Directory with RemoteRoot / RemoteBridge / runtime / preload. */
  exposesDir?: string;
  /** Shares nothing (legacy app on another React): bridge-only remote, no bridge variant needed. */
  isolated?: boolean;
  /** React Compiler (on for every app on the React singleton). */
  compiler?: boolean;
  /** DEMO ONLY: tamper with the shared config to simulate an incompatible release. `portal-cli verify` rejects it. */
  unsafeSharedOverride?: (shared: Record<string, SharedEntry>) => Record<string, SharedEntry>;
  /** Internal, team-owned Vite settings (anything except the MF section). */
  extend?: UserConfig;
};

/**
 * The Babel plugin is an OPTIONAL peer (only apps with React Compiler install it): import it lazily, otherwise every
 * app — e.g. a React 18 bridge remote without the compiler — would need it just to load this preset.
 */
const reactPlugins = async (compiler: boolean): Promise<PluginOption[]> => {
  if (!compiler) {
    return [react()];
  }
  const { default: babel } = await import('@rolldown/plugin-babel');
  return [react(), babel({ presets: [reactCompilerPreset()] })];
};

/**
 * Remote build preset. The MF section (name, exposes, shared, bridge variant) is the integration contract and lives
 * here; teams extend everything else. `--mode bridge` builds the isolated variant (no shared deps) into dist-bridge.
 */
export const createRemoteViteConfig = (options: RemoteViteOptions): UserConfigFnPromise => {
  const appRoot = fileURLToPath(new URL('.', options.configUrl)).replace(/\/$/, '');
  assertBuildTooling(appRoot);
  // `portal-cli deploy` sets the version (`v1.4.2` → 1.4.2, release/1.4 → 1.4.3-rc.7, dev3 → 1.5.0-snapshot.12+8d55cff):
  // package.json only holds the line.
  const appVersion = process.env['PORTAL_APP_VERSION'] || readJson(`${appRoot}/package.json`).version;
  const viteVersion = installedVersion(appRoot, 'vite');
  const commit = gitCommitOf(appRoot);
  const exposesDir = options.exposesDir ?? 'src/app/exposes';
  const sharedConfig = options.unsafeSharedOverride?.(createSharedConfig()) ?? createSharedConfig();

  return defineConfig(async ({ command, mode }) => {
    const isBridgeVariant = mode === 'bridge';
    const base: UserConfig = {
      base: './',
      define: { PORTAL_APP_VERSION: JSON.stringify(appVersion) },
      resolve: { alias: { '@': `${appRoot}/src` } },
      server: { port: options.port, origin: `http://localhost:${options.port}`, cors: true },
      preview: { port: options.port, cors: true },
      build: {
        target: 'es2023',
        outDir: isBridgeVariant ? 'dist-bridge' : 'dist',
        // The standalone app (index.html: mock auth, dev tooling) is for `vite dev` only: a release holds just
        // remoteEntry + exposes, so nothing but the host can run it.
        ...(command === 'build' ? { rolldownOptions: { input: {} } } : {}),
        // The bridge variant bundles its own React, router and DS on purpose: big chunks are expected there.
        ...(isBridgeVariant ? { chunkSizeWarningLimit: 2000 } : {}),
      },
      plugins: [
        ...(await reactPlugins(options.compiler ?? true)),
        federation({
          name: isBridgeVariant ? toBridgeRemoteName(options.name) : options.name,
          filename: 'remoteEntry.js',
          dts: false,
          manifest: {
            // Recorded for the gates, the host's runtime check and investigations (pluginVersion is added by the
            // plugin itself; `commit`: what to check out to reproduce this build).
            // The plugin calls this for mf-manifest.json (passed as `stats`) and for mf-stats.json.
            additionalData: ({ stats }) => {
              const metaData = stats['metaData'];
              if (metaData && typeof metaData === 'object') {
                Object.assign(metaData, { portal: { appVersion, vite: viteVersion, ...(commit ? { commit } : {}) } });
              }
            },
          },
          exposes: Object.fromEntries(
            Object.entries(REMOTE_EXPOSES).map(([file, expose]) => [expose, resolveExpose(appRoot, exposesDir, file)]),
          ),
          shared: options.isolated || isBridgeVariant ? {} : sharedConfig,
        }),
      ],
    };
    return mergeConfig(base, options.extend ?? {});
  });
};

export type HostViteOptions = {
  port: number;
  configUrl: string;
  /** Host-specific plugins (compat.json, dev config, ...). */
  plugins?: PluginOption[];
  extend?: UserConfig;
};

/** Host build preset: same pinned tooling and React Compiler; remotes are registered at runtime (no static remotes). */
export const createHostViteConfig = async (options: HostViteOptions): Promise<UserConfig> => {
  const appRoot = fileURLToPath(new URL('.', options.configUrl)).replace(/\/$/, '');
  assertBuildTooling(appRoot);
  const base: UserConfig = {
    resolve: { alias: { '@': `${appRoot}/src` } },
    server: { port: options.port },
    preview: { port: options.port },
    build: { target: 'es2023' },
    plugins: [
      ...(await reactPlugins(true)),
      ...(options.plugins ?? []),
      federation({ name: 'host', remotes: {}, dts: false, shared: createSharedConfig() }),
    ],
  };
  return mergeConfig(base, options.extend ?? {});
};
