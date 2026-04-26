import { describe, it, expect } from 'vitest';
import { isNotFound } from '../supabaseErrors';

describe('isNotFound()', () => {
  it('PGRST116 에러 → true', () => {
    expect(isNotFound({ code: 'PGRST116', message: 'JSON object requested...' })).toBe(true);
  });

  it('다른 에러 코드 → false', () => {
    expect(isNotFound({ code: '23505', message: 'duplicate key' })).toBe(false);
  });

  it('코드 없는 에러 → false', () => {
    expect(isNotFound({ message: 'some error' })).toBe(false);
  });

  it('null → false', () => {
    expect(isNotFound(null)).toBe(false);
  });

  it('undefined → false', () => {
    expect(isNotFound(undefined)).toBe(false);
  });

  it('string → false', () => {
    expect(isNotFound('PGRST116')).toBe(false);
  });
});
