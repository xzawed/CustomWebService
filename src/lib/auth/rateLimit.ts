interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 인메모리 슬라이딩 카운터. 한도 내면 true(요청 허용), 초과면 false. 단일 인스턴스 전제. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
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
