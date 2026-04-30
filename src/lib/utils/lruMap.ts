/**
 * 단순 LRU(Least Recently Used) Map.
 * Map의 insertion order를 활용 — get/set 시 항목을 끝으로 이동시켜
 * 오래된 항목이 항상 first()로 노출됨. 크기 초과 시 first 항목 evict.
 *
 * Railway 단일 인스턴스 메모리 누적 방지용. 멀티 인스턴스 전환 시
 * Redis 등 외부 저장소로 교체 필요.
 */
export class LRUMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (maxSize <= 0) throw new Error('LRUMap maxSize must be > 0');
  }

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // 최근 사용으로 표시 — 끝으로 이동
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }
}
