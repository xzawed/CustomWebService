import { describe, it, expect } from 'vitest';
import { buildConditions } from './conditionBuilder';

describe('buildConditions', () => {
  it('returns undefined when no filter is provided', () => {
    expect(buildConditions(undefined)).toBeUndefined();
  });

  it('returns undefined for an empty filter object', () => {
    expect(buildConditions({})).toBeUndefined();
  });

  it('returns undefined when all values are undefined or null', () => {
    expect(buildConditions({ userId: undefined, name: null })).toBeUndefined();
  });

  it('returns a truthy value for a single-field filter', () => {
    expect(buildConditions({ userId: 'abc' })).toBeTruthy();
  });

  it('returns a truthy value for a multi-field filter', () => {
    expect(buildConditions({ userId: 'abc', name: 'test' })).toBeTruthy();
  });
});
