import { createElement } from 'react';

/**
 * Compares the remote's `createElement` with the host's BY REFERENCE.
 * Never compare `React.version` strings: the same version does not mean the same instance.
 */
export const isSameReactInstance = (remoteCreateElement: unknown): boolean => remoteCreateElement === createElement;

export type ContractVersionRange = {
  min: number;
  max: number;
};

export const isContractVersionSupported = (version: unknown, supportedRange: ContractVersionRange): boolean =>
  typeof version === 'number' &&
  Number.isInteger(version) &&
  version >= supportedRange.min &&
  version <= supportedRange.max;
