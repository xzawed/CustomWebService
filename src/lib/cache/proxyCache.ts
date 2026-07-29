import { createHash } from 'node:crypto';
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

  // ⚠️ 응답 본문을 인메모리(per-instance)에 **평문**으로 보관한다. 캐시는 카탈로그에
  // `cacheTtlSeconds`가 명시된 API에만 활성화되므로 어떤 응답이 캐시되는지는 관리자의 명시적
  // 결정이다. 키 자체는 캐시에 담기지 않는다 — 아웃바운드로만 주입되고, 캐시 키에는 원문이
  // 아니라 지문(`keyFingerprint`)이 들어간다.
  //
  // 키별 격리는 캐시 키가 담당한다(다른 키 = 다른 항목). 다만 개인화 응답이 프로세스 메모리에
  // 평문으로 남는 것은 그대로이므로, 민감 데이터를 반환하는 API에 `cacheTtlSeconds`를 부여할
  // 때는 카탈로그에 캐시 민감도 플래그를 두어 제외하거나 at-rest 암호화를 적용할 것.
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

/** 키가 주입되지 않은 요청의 신원. 16자 hex인 지문과 절대 충돌하지 않는다. */
export const NO_KEY_IDENTITY = 'none';

/**
 * 주입된 API 키의 지문. 캐시 키에 **원문 대신** 이 값을 넣는다.
 *
 * 캐시 키는 로그·디버깅 경로에서 보일 수 있으므로 원문을 넣어서는 안 된다. 16자로 잘라
 * 길이 정보도 남기지 않는다(충돌 확률은 64비트라 캐시 용도에 충분하다).
 */
export function keyFingerprint(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * 캐시 키: apiId + proxyPath + 정렬된 전달 파라미터 + **키 신원**.
 *
 * `keyIdentity`가 없으면 서로 다른 키로 받은 응답이 같은 항목을 공유해 **교차 테넌트 유출**이
 * 된다 — 익명 site 모드에서 오너의 개인 키로 업스트림을 호출하게 되면서 실재하는 위험이 됐다.
 * 선택 인자로 두지 않는 이유: 호출부가 잊으면 조용히 그 위험이 돌아온다.
 *
 * 플랫폼 키도 지문을 쓴다. 값이 같으므로 모든 호출자가 캐시를 공유하고(기존 동작과 동일),
 * 키를 교체하면 지문이 바뀌어 옛 키로 받은 응답이 자동으로 무효화된다.
 */
export function buildCacheKey(
  apiId: string,
  proxyPath: string,
  forwardedParams: URLSearchParams,
  keyIdentity: string,
): string {
  const sorted = Array.from(forwardedParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${apiId}:${proxyPath}:${sorted}:${keyIdentity}`;
}
