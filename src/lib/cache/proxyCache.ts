import { LRUMap } from '@/lib/utils/lruMap';

const MAX_CACHE_ENTRIES = (() => {
  const v = Number.parseInt(process.env.PROXY_CACHE_MAX_ENTRIES ?? '', 10);
  return Number.isNaN(v) || v <= 0 ? 500 : v;
})();

interface CacheEntry {
  body: string;
  contentType: string;
  status: number;
  expiresAt: number;
}

class ProxyCache {
  private readonly cache: LRUMap<string, CacheEntry>;

  constructor(maxEntries: number) {
    this.cache = new LRUMap<string, CacheEntry>(maxEntries);
  }

  get(key: string): Omit<CacheEntry, 'expiresAt'> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return { body: entry.body, contentType: entry.contentType, status: entry.status };
  }

  // ⚠️ 응답 본문을 인메모리(per-instance)에 평문으로 보관한다. 현재 캐시는 `cacheTtlSeconds`가
  // 명시된 공개 API(예: 기상청 날씨 — 비민감 데이터)에만 활성화되며, auth 키는 캐시 응답이 아닌
  // 아웃바운드로 주입되므로(buildCacheKey도 auth 키 제외) 민감정보가 캐시에 담기지 않는다.
  // 향후 민감 데이터를 반환하는 API에 cacheTtlSeconds를 부여한다면, 카탈로그에 캐시 민감도
  // 플래그를 추가하고 해당 응답은 캐시에서 제외하거나 at-rest 암호화를 적용할 것.
  set(key: string, value: Omit<CacheEntry, 'expiresAt'>, ttlMs: number): void {
    this.cache.set(key, { ...value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  /** 만료되지 않은 항목 수 반환. O(n) — 전체 순회로 live 항목만 집계 (lazy eviction 방식이므로 LRUMap.size는 만료 항목 포함) */
  get size(): number {
    const now = Date.now();
    let count = 0;
    for (const [, entry] of this.cache) {
      if (now <= entry.expiresAt) count++;
    }
    return count;
  }
}

export const proxyCache = new ProxyCache(MAX_CACHE_ENTRIES);

// 캐시 키: apiId + proxyPath + 정렬된 전달 파라미터 (auth 키는 서버 측 주입이라 포함 안 됨)
export function buildCacheKey(
  apiId: string,
  proxyPath: string,
  forwardedParams: URLSearchParams,
): string {
  const sorted = Array.from(forwardedParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${apiId}:${proxyPath}:${sorted}`;
}
