import { execSync } from 'node:child_process';
import { relative } from 'node:path';

const git = (registryDir: string, args: string) => execSync(`git ${args}`, { cwd: registryDir, stdio: 'pipe', encoding: 'utf8' });

/**
 * Commits straight to the registry's main branch: a deploy someone started by hand in the pipeline UI IS the approval.
 * Another deploy may have pushed meanwhile (other files): rebase and retry.
 */
const pushRegistryChange = (registryDir: string, files: string[], title: string): void => {
  git(registryDir, `add ${files.map((file) => relative(registryDir, file)).join(' ')}`);
  git(registryDir, `commit -m "${title}"`);
  for (let attempt = 1; ; attempt += 1) {
    try {
      git(registryDir, 'push');
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
      git(registryDir, 'pull --rebase');
    }
  }
};

/** A pull request instead (`--pr`), e.g. when a stand owner must approve: branch, commit, push, `gh pr create`. */
const openRegistryPullRequest = (registryDir: string, files: string[], title: string): string => {
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

export type ChangeMode = { push?: boolean; pr?: boolean };

/** Saves written registry files the requested way and says where they went. Pushing to main deploys the stand config. */
export const saveRegistryChange = (registryDir: string, files: string[], title: string, mode: ChangeMode): void => {
  if (mode.push) {
    pushRegistryChange(registryDir, files, title);
    console.log(`  Pushed to the registry: ${title} — the config deploy updates the stand.`);
  } else if (mode.pr) {
    console.log(`  Pull request: ${openRegistryPullRequest(registryDir, files, title)} — merge deploys the stand config.`);
  } else {
    console.log(`  Written locally (${files.map((file) => relative(registryDir, file)).join(', ')}): --push commits it, --pr opens a pull request.`);
  }
};
