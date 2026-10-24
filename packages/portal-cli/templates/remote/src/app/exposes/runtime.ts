import { PLATFORM_CONTRACT_VERSION } from '@portal-poc/platform-contract';

/** The host compares this BY REFERENCE with its own createElement to choose integrated vs bridge mode. */
export { createElement as remoteCreateElement } from 'react';

export const contractVersion = PLATFORM_CONTRACT_VERSION;
