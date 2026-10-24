import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const isMissingOrEmptyDir = (dir: string): boolean => !existsSync(dir) || readdirSync(dir).length === 0;

/** Walks up from `start` looking for a pnpm workspace root (generated packages then use `workspace:^`). */
export const findWorkspaceRoot = (start: string): string | null => {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

export const listFilesRecursive = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(path) : [path];
  });
