import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAddSlice } from '../src/commands/add-slice.ts';
import { runCreateRemote } from '../src/commands/create-remote.ts';

const tempDir = () => mkdtempSync(join(tmpdir(), 'portal-cli-'));

describe('create remote', () => {
  it('generates the skeleton with only the requested optional layers', async () => {
    const dir = join(tempDir(), 'reports-remote');
    await runCreateRemote('reports', { dir, layers: 'features', presets: true, bridge: true, port: '5180' });

    expect(readFileSync(join(dir, 'vite.config.ts'), 'utf8')).toContain("name: 'reports'");
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"@portal-poc/platform-runtime": "^2.2.0"');
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"@portal-poc/http": "^1.0.0"');
    expect(existsSync(join(dir, 'src/features/README.md'))).toBe(true);
    expect(existsSync(join(dir, 'src/entities'))).toBe(false);
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    expect(readFileSync(join(dir, '.oxlintrc.json'), 'utf8')).toContain('@portal-poc/presets');
  });

  it('inlines configs and stubs the bridge entry on request', async () => {
    const dir = join(tempDir(), 'audit-remote');
    await runCreateRemote('audit', { dir, layers: '', presets: false, bridge: false });

    expect(readFileSync(join(dir, '.oxlintrc.json'), 'utf8')).toContain('react/purity');
    expect(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).toContain('"strict": true');
    expect(readFileSync(join(dir, 'src/app/exposes/RemoteBridge.tsx'), 'utf8')).toContain('does not support');
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).not.toContain('bridge-react');
  });

  it('rejects invalid names', async () => {
    await expect(runCreateRemote('Bad-Name', { yes: true, dir: join(tempDir(), 'x') })).rejects.toThrow(/Invalid remote name/);
  });
});

describe('add slice', () => {
  it('creates a page slice with ui segment and public index', () => {
    const dir = tempDir();
    const slice = runAddSlice('page', 'user-settings', { dir, segments: 'api,model' });

    expect(readFileSync(join(slice, 'index.ts'), 'utf8')).toBe("export { UserSettingsPage } from './ui/UserSettingsPage';\n");
    expect(existsSync(join(slice, 'api/README.md'))).toBe(true);
    expect(() => runAddSlice('page', 'user-settings', { dir })).toThrow(/already exists/);
  });
});
