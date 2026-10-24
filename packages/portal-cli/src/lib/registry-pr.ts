import { execSync } from 'node:child_process';
import { relative } from 'node:path';

const git = (registryDir: string, args: string) => execSync(`git ${args}`, { cwd: registryDir, stdio: 'pipe', encoding: 'utf8' });

/**
 * A registry change IS a pull request to the registry repository: branch, commit, push, `gh pr create`.
 * Branch policies there require the gate (registry check) and the stand owner's approval; merge deploys the config.
 */
export const openRegistryPullRequest = (registryDir: string, files: string[], title: string): string => {
  const branch = `change/${title.replace(/[^a-z0-9.@-]+/gi, '-')}`;
  git(registryDir, `checkout -B ${branch}`);
  git(registryDir, `add ${files.map((file) => relative(registryDir, file)).join(' ')}`);
  git(registryDir, `commit -m "${title}"`);
  git(registryDir, `push -u origin ${branch} --force-with-lease`);
  const url = execSync(`gh pr create --fill --head ${branch} --title "${title}"`, {
    cwd: registryDir,
    stdio: 'pipe',
    encoding: 'utf8',
  }).trim();
  git(registryDir, 'checkout -');
  return url;
};
