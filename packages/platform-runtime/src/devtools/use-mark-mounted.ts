import { useEffect } from 'react';
import type { PlatformContract } from '@portal-poc/platform-contract';

/** Marks the application's routes as mounted (drives devtools auto-selection). */
export const useMarkMounted = (platform: PlatformContract, name: string): void => {
  const devtools = platform.devtools;
  useEffect(() => devtools?.markMounted(name), [devtools, name]);
};
