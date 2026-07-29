import {
  RATE_LIMIT_WINDOW_MS,
  SITE_PROXY_RATE_LIMIT_PER_MIN,
  SITE_PROXY_PROJECT_LIMIT_PER_MIN,
  MAX_SITE_RATE_LIMIT_BUCKETS,
} from '@/lib/config/rateLimit';
import { logger } from '@/lib/utils/logger';

interface Bucket {
  count: number;
  resetAt: number;
  /** 이 윈도에서 한도 도달 경고를 이미 남겼는지. 봇이 두드리면 로그가 폭발하므로 1회로 억제한다. */
  warned?: boolean;
}

/** 프로젝트별 누적 집계. 리밋 버킷과 달리 윈도가 지나도 리셋되지 않는다(추세 관측용). */
interface ProjectStats {
  allowed: number;
  blockedByIp: number;
  blockedByProject: number;
}

export interface SiteProxyProjectStats extends ProjectStats {
  projectId: string;
}

export interface SiteProxyStats {
  /** 집계 시작 시각(프로세스 시작 또는 마지막 리셋). 인메모리라 재시작 시 초기화된다. */
  since: string;
  limits: { perIpPerMin: number; perProjectPerMin: number };
  trackedProjects: number;
  /** 용량 초과로 집계에서 빠진 프로젝트가 있는지. 조용한 절단을 만들지 않는다. */
  truncated: boolean;
  projects: SiteProxyProjectStats[];
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

const projectStats = new Map<string, ProjectStats>();
let statsTruncated = false;
let statsSince = Date.now();
/** 용량 소진 경고의 마지막 시각. 이 경고는 버킷이 없어 버킷 단위로 억제할 수 없다. */
let capacityWarnedAt = 0;

function sweepExpired(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map) {
    if (now >= bucket.resetAt) map.delete(key);
  }
}

/**
 * 버킷을 하나 소비한다.
 * 한도 초과이거나 용량 부족으로 새 버킷을 만들 수 없으면 allowed=false.
 * 경고 억제를 버킷에 붙이기 위해 버킷 자체도 함께 돌려준다(용량 부족이면 null).
 */
function consume(
  map: Map<string, Bucket>,
  key: string,
  limit: number,
  now: number,
): { allowed: boolean; resetAt: number; bucket: Bucket | null } {
  const existing = map.get(key);
  if (existing && now < existing.resetAt) {
    if (existing.count >= limit) {
      return { allowed: false, resetAt: existing.resetAt, bucket: existing };
    }
    existing.count++;
    return { allowed: true, resetAt: existing.resetAt, bucket: existing };
  }

  // 신규 또는 만료된 버킷 — 자리가 없으면 먼저 만료분만 정리한다.
  if (!existing && map.size >= MAX_SITE_RATE_LIMIT_BUCKETS) {
    sweepExpired(map, now);
    if (map.size >= MAX_SITE_RATE_LIMIT_BUCKETS) {
      // 활성 카운터를 버리느니 차단한다(한도 우회 방지).
      return { allowed: false, resetAt: now + RATE_LIMIT_WINDOW_MS, bucket: null };
    }
  }

  const resetAt = now + RATE_LIMIT_WINDOW_MS;
  const bucket: Bucket = { count: 1, resetAt };
  map.set(key, bucket);
  return { allowed: true, resetAt, bucket };
}

/**
 * 프로젝트 집계를 갱신한다.
 *
 * 용량을 넘기면 **새 프로젝트만** 집계에서 제외하고 기존 카운터는 계속 센다.
 * 빠진 사실은 `truncated`로 드러낸다 — 조용히 잘라내면 "전부 집계된 수치"로 오독된다.
 */
function recordStat(projectId: string, field: keyof ProjectStats): void {
  let stat = projectStats.get(projectId);
  if (!stat) {
    if (projectStats.size >= MAX_SITE_RATE_LIMIT_BUCKETS) {
      statsTruncated = true;
      return;
    }
    stat = { allowed: 0, blockedByIp: 0, blockedByProject: 0 };
    projectStats.set(projectId, stat);
  }
  stat[field]++;
}

export function checkSiteRateLimit(
  clientIp: string,
  projectId: string,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  const perIp = consume(ipBuckets, `${clientIp}:${projectId}`, SITE_PROXY_RATE_LIMIT_PER_MIN, now);
  if (!perIp.allowed) {
    recordStat(projectId, 'blockedByIp');
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((perIp.resetAt - now) / 1000)) };
  }

  const perProject = consume(projectBuckets, projectId, SITE_PROXY_PROJECT_LIMIT_PER_MIN, now);
  if (!perProject.allowed) {
    recordStat(projectId, 'blockedByProject');
    warnProjectLimit(projectId, perProject.bucket, now);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((perProject.resetAt - now) / 1000)),
    };
  }

  recordStat(projectId, 'allowed');
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * 프로젝트 전역 한도 소진을 남긴다.
 *
 * 이 한도는 **분산 IP로도 우회되지 않는 실질 상한**이라, 도달했다는 것은 그 프로젝트의
 * 오너 키가 소진되고 있다는 뜻이다. 이전에는 429 응답만 나가고 아무 신호도 남지 않아
 * 오너도 운영자도 알 수 없었다.
 *
 * 버킷당 윈도 1회로 억제한다 — 봇이 계속 두드리면 매 요청마다 남아 로그가 무의미해진다.
 * Slack 승격은 실사용 트래픽을 보고 임계를 정한 뒤에 한다(경보 피로 방지).
 */
function warnProjectLimit(projectId: string, bucket: Bucket | null, now: number): void {
  if (bucket) {
    if (bucket.warned) return;
    bucket.warned = true;
    logger.warn('Site proxy project limit reached', {
      projectId,
      limit: SITE_PROXY_PROJECT_LIMIT_PER_MIN,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  // 버킷 자체를 만들지 못한 경우(전체 용량 소진) — 억제할 버킷이 없으므로 시간으로 억제한다.
  if (now - capacityWarnedAt < RATE_LIMIT_WINDOW_MS) return;
  capacityWarnedAt = now;
  logger.warn('Site proxy rate limit capacity exhausted — new projects are being blocked', {
    maxBuckets: MAX_SITE_RATE_LIMIT_BUCKETS,
  });
}

/** 운영 지표 — 프로젝트별 site 프록시 사용량. 호출량이 많은 순으로 정렬한다. */
export function getSiteProxyStats(): SiteProxyStats {
  const total = (s: ProjectStats): number => s.allowed + s.blockedByIp + s.blockedByProject;
  const projects: SiteProxyProjectStats[] = Array.from(projectStats.entries())
    .map(([projectId, s]) => ({ projectId, ...s }))
    .sort((a, b) => total(b) - total(a));

  return {
    since: new Date(statsSince).toISOString(),
    limits: {
      perIpPerMin: SITE_PROXY_RATE_LIMIT_PER_MIN,
      perProjectPerMin: SITE_PROXY_PROJECT_LIMIT_PER_MIN,
    },
    trackedProjects: projects.length,
    truncated: statsTruncated,
    projects,
  };
}

/** 테스트 전용 — 모듈 레벨 상태를 초기화한다. */
export function __resetSiteRateLimit(): void {
  ipBuckets.clear();
  projectBuckets.clear();
  projectStats.clear();
  statsTruncated = false;
  statsSince = Date.now();
  capacityWarnedAt = 0;
}
