import { describe, it, expect } from 'vitest';
import { isUniqueViolation } from './errors';

describe('isUniqueViolation', () => {
  it('returns false for null', () => {
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it('returns false for 0', () => {
    expect(isUniqueViolation(0)).toBe(false);
  });

  it('returns false for false', () => {
    expect(isUniqueViolation(false)).toBe(false);
  });

  it('returns true for supabase-style object with code "23505"', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('returns false for supabase-style object with a different code', () => {
    expect(isUniqueViolation({ code: '42000' })).toBe(false);
  });

  it('returns true for plain Error whose message contains "23505"', () => {
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint 23505'))).toBe(true);
  });

  it('returns false for plain Error whose message does NOT contain "23505"', () => {
    expect(isUniqueViolation(new Error('some other error'))).toBe(false);
  });

  it('returns true for Error with code property set to "23505"', () => {
    const err = Object.assign(new Error('duplicate key'), { code: '23505' });
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('returns false for a plain string', () => {
    expect(isUniqueViolation('23505')).toBe(false);
  });

  it('returns false when code is a number (not a string)', () => {
    expect(isUniqueViolation({ code: 23505 })).toBe(false);
  });
});
