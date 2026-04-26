import { describe, it, expect } from 'vitest';
import { normalizePagination } from '../pagination';

describe('normalizePagination()', () => {
  it('기본값 page=1, limit=20', () => {
    const { offset, limit } = normalizePagination({});
    expect(offset).toBe(0);
    expect(limit).toBe(20);
  });

  it('page=2, limit=10 → offset=10', () => {
    const { offset, limit } = normalizePagination({ page: 2, limit: 10 });
    expect(offset).toBe(10);
    expect(limit).toBe(10);
  });

  it('page=3, limit=20 → offset=40', () => {
    const { offset } = normalizePagination({ page: 3, limit: 20 });
    expect(offset).toBe(40);
  });

  it('page=1은 offset=0', () => {
    const { offset } = normalizePagination({ page: 1, limit: 5 });
    expect(offset).toBe(0);
  });
});
