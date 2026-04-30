import { describe, it, expect } from 'vitest';
import { LRUMap } from './lruMap';

describe('LRUMap', () => {
  it('maxSize <= 0이면 throw한다', () => {
    expect(() => new LRUMap<string, number>(0)).toThrow();
    expect(() => new LRUMap<string, number>(-1)).toThrow();
  });

  it('set/get/has/delete 기본 동작', () => {
    const lru = new LRUMap<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    expect(lru.get('a')).toBe(1);
    expect(lru.has('b')).toBe(true);
    expect(lru.delete('a')).toBe(true);
    expect(lru.has('a')).toBe(false);
    expect(lru.size).toBe(1);
  });

  it('maxSize 초과 시 가장 오래된 항목을 evict한다', () => {
    const lru = new LRUMap<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.set('d', 4); // a 제거되어야 함
    expect(lru.has('a')).toBe(false);
    expect(lru.has('b')).toBe(true);
    expect(lru.has('c')).toBe(true);
    expect(lru.has('d')).toBe(true);
    expect(lru.size).toBe(3);
  });

  it('get은 항목을 최근 사용으로 갱신한다 (eviction에서 보호)', () => {
    const lru = new LRUMap<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.get('a'); // a를 최근 사용으로 → 끝으로 이동
    lru.set('d', 4); // 가장 오래된 b가 evict되어야 함
    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
    expect(lru.has('c')).toBe(true);
    expect(lru.has('d')).toBe(true);
  });

  it('동일 키로 set 시 최근 사용 갱신', () => {
    const lru = new LRUMap<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.set('a', 11); // 값 갱신 + 최근 사용
    lru.set('d', 4); // b가 evict되어야 함
    expect(lru.get('a')).toBe(11);
    expect(lru.has('b')).toBe(false);
  });

  it('clear()로 모두 제거', () => {
    const lru = new LRUMap<string, number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.clear();
    expect(lru.size).toBe(0);
    expect(lru.has('a')).toBe(false);
  });

  it('1000개 초과 시에도 정상 evict (rate limit 시나리오)', () => {
    const lru = new LRUMap<string, number>(1000);
    for (let i = 0; i < 1500; i++) lru.set(`u${i}`, i);
    expect(lru.size).toBe(1000);
    expect(lru.has('u0')).toBe(false);
    expect(lru.has('u499')).toBe(false);
    expect(lru.has('u500')).toBe(true);
    expect(lru.has('u1499')).toBe(true);
  });
});
