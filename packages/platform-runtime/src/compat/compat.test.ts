import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { isContractVersionSupported, isSameReactInstance } from './compat';

const foreignCreateElement = (...args: Parameters<typeof createElement>) => createElement(...args);

describe('compat', () => {
  it('compares React instances by reference, not by version string', () => {
    expect(isSameReactInstance(createElement)).toBe(true);
    expect(isSameReactInstance(foreignCreateElement)).toBe(false);
  });

  it('checks contract versions against a range', () => {
    expect(isContractVersionSupported(1, { min: 1, max: 1 })).toBe(true);
    expect(isContractVersionSupported(2, { min: 1, max: 1 })).toBe(false);
    expect(isContractVersionSupported('1', { min: 1, max: 1 })).toBe(false);
  });
});
