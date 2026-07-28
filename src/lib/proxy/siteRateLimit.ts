import {
  RATE_LIMIT_WINDOW_MS,
  SITE_PROXY_RATE_LIMIT_PER_MIN,
  SITE_PROXY_PROJECT_LIMIT_PER_MIN,
  MAX_SITE_RATE_LIMIT_BUCKETS,
} from '@/lib/config/rateLimit';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * 익명 게시 사이트 프록시 레이트리밋.
 *
 * 기존 프록시 리미터(`/api/v1/proxy`의 LRUMap)는 용량 초과 시 **활성 윈도의 카운터가
 * 통째로 evict된다** — 다음 요청이 count:1로 다시 시작해 한도를 우회할 수 있다.
 * 이 리미터는 타인 API 키 소진을 막는 유일한 경계이므로 그 패턴을 쓰지 않는다:
 * 만료된 버킷만 정리하고, 자리가 부족하면 살아 있는 카운터를 버리는 대신
 * 새 버킷 생성을 거부(=차단)한다. 우회보다 과차단이 안전하다.
 *
 * Railway 단일 인스턴스 전제. 멀티 인스턴스 전환 시 Redis 등으로 교체 필요.
 */
const ipBuckets = new Map<string, Bucket>();
const projectBuckets = new Map<string, Bucket>();

function sweepExpired(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map) {
    if (now >= bucket.resetAt) map.delete(key);
  }
}

/**
 * 버킷을 하나 소비한다.
 * 한도 초과이거나 용량 부족으로 새 버킷을 만들 수 없으면 allowed=false.
 */
function consume(
  map: Map<string, Bucket>,
  key: string,
  limit: number,
  now: number,
): { allowed: boolean; resetAt: number } {
  const existing = map.get(key);
  if (existing && now < existing.resetAt) {
    if (existing.count >= limit) return { allowed: false, resetAt: existing.resetAt };
    existing.count++;
    return { allowed: true, resetAt: existing.resetAt };
  }

  // 신규 또는 만료된 버킷 — 자리가 없으면 먼저 만료분만 정리한다.
  if (!existing && map.size >= MAX_SITE_RATE_LIMIT_BUCKETS) {
    sweepExpired(map, now);
    if (map.size >= MAX_SITE_RATE_LIMIT_BUCKETS) {
      // 활성 카운터를 버리느니 차단한다(한도 우회 방지).
      return { allowed: false, resetAt: now + RATE_LIMIT_WINDOW_MS };
    }
  }

  const resetAt = now + RATE_LIMIT_WINDOW_MS;
  map.set(key, { count: 1, resetAt });
  return { allowed: true, resetAt };
}

export function checkSiteRateLimit(
  clientIp: string,
  projectId: string,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  const perIp = consume(ipBuckets, `${clientIp}:${projectId}`, SITE_PROXY_RATE_LIMIT_PER_MIN, now);
  if (!perIp.allowed) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((perIp.resetAt - now) / 1000)) };
  }

  const perProject = consume(projectBuckets, projectId, SITE_PROXY_PROJECT_LIMIT_PER_MIN, now);
  if (!perProject.allowed) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((perProject.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

/** 테스트 전용 — 모듈 레벨 상태를 초기화한다. */
export function __resetSiteRateLimit(): void {
  ipBuckets.clear();
  projectBuckets.clear();
}
