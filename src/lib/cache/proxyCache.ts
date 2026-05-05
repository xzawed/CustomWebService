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

  set(key: string, value: Omit<CacheEntry, 'expiresAt'>, ttlMs: number): void {
    this.cache.set(key, { ...value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

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
