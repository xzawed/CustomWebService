import {
  MAX_AUTH_RATE_LIMIT_BUCKETS,
  RATE_LIMIT_WINDOW_MS,
} from '@/lib/config/rateLimit';
import { logger } from '@/lib/utils/logger';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 용량 소진 경고 억제 — 버킷이 없어 버킷 단위로 못 막으므로 시간으로 억제한다. */
let capacityWarnedAt = 0;

function sweepExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

function warnCapacity(now: number): void {
  if (now - capacityWarnedAt < RATE_LIMIT_WINDOW_MS) return;
  capacityWarnedAt = now;
  logger.warn('Auth rate limit capacity exhausted — new keys are being blocked', {
    maxBuckets: MAX_AUTH_RATE_LIMIT_BUCKETS,
  });
}

/**
 * 신규 키를 넣을 자리가 있는지 확인한다.
 * 만료분만 정리하고, 그래도 가득이면 false(과차단). 활성 윈도는 절대 버리지 않는다.
 */
function ensureCapacityForNewKey(now: number): boolean {
  if (buckets.size < MAX_AUTH_RATE_LIMIT_BUCKETS) return true;
  sweepExpired(now);
  if (buckets.size < MAX_AUTH_RATE_LIMIT_BUCKETS) return true;
  warnCapacity(now);
  return false;
}

/** 인메모리 카운터. 한도 내면 true(요청 허용), 초과·용량 부족이면 false. 단일 인스턴스 전제. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (existing && now < existing.resetAt) {
    if (existing.count >= limit) return false;
    existing.count += 1;
    return true;
  }

  // 만료된 키는 같은 슬롯을 덮어쓰므로 size가 늘지 않는다.
  if (existing) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (!ensureCapacityForNewKey(now)) return false;
  buckets.set(key, { count: 1, resetAt: now + windowMs });
  return true;
}

/**
 * 읽기 전용 한도 검사. 버킷을 만들거나 count를 올리지 않는다.
 *
 * - 활성 버킷의 count ≥ limit → true
 * - 없거나 만료 → false (단, 맵이 cap에 가득 찬 경우 없는 키도 true — 키 회전 우회 차단)
 */
export function isLimited(key: string, limit: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (existing && now < existing.resetAt) {
    return existing.count >= limit;
  }

  if (existing) {
    buckets.delete(key);
  }

  // 없는 키: 정상 시 false. cap 가득이면 fail-closed.
  if (buckets.size >= MAX_AUTH_RATE_LIMIT_BUCKETS) {
    sweepExpired(now);
    if (buckets.size >= MAX_AUTH_RATE_LIMIT_BUCKETS) {
      warnCapacity(now);
      return true;
    }
  }
  return false;
}

/**
 * 실패 1회를 기록한다. 한도 내면 생성·증가 후 true.
 * 신규 키인데 cap 가득(만료 정리 후에도)이면 만들지 않고 false.
 */
export function recordFailure(key: string, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);

  if (existing && now < existing.resetAt) {
    existing.count += 1;
    return true;
  }

  if (existing) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (!ensureCapacityForNewKey(now)) return false;
  buckets.set(key, { count: 1, resetAt: now + windowMs });
  return true;
}

/** 특정 키 버킷을 제거한다(로그인 성공 시 계정 키 초기화 등). */
export function clearKey(key: string): void {
  buckets.delete(key);
}

/** 테스트 전용 — 모듈 레벨 상태를 초기화한다. */
export function __resetAuthRateLimit(): void {
  buckets.clear();
  capacityWarnedAt = 0;
}

/**
 * 프록시(Railway) 뒤 클라이언트 IP.
 *
 * x-forwarded-for의 **최우측** 항목만 신뢰한다. 최좌측은 클라이언트가 임의로 위조할 수 있어
 * per-IP 레이트리밋(미인증 signup·forgot-password의 이메일 발송 한도)을 무력화한다.
 * 신뢰 경계인 마지막 프록시가 덧붙인 값이 최우측이다. adminAuth.verifyAdminKey와 동일 규칙.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  const rightmost = xff?.split(',').at(-1)?.trim();
  if (rightmost) return rightmost;

  // XFF가 없으면 x-real-ip로 폴백하지 않는다.
  //
  // x-real-ip는 신뢰 경계(Railway 엣지)가 붙였다는 보장이 없어 클라이언트가 자유롭게
  // 위조·회전할 수 있다. 폴백을 두면 XFF가 없는 경로에서 per-IP 한도(signup·비밀번호
  // 재설정 메일 발송)가 통째로 무력화된다. 식별 불가일 땐 단일 'unknown' 버킷으로
  // 모아 fail-closed 한다 — 과차단이 우회보다 안전하다.
  return 'unknown';
}
