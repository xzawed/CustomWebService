/** platform_events.payload 익명화 — 계정 삭제 시 감사 행 보존 + PII 제거. */

const PII_KEY_DENYLIST = new Set([
  'email',
  'name',
  'avatarUrl',
  'avatar_url',
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'rawToken',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'phone',
  'ip',
  'ipAddress',
  'clientIp',
  // slug는 사용자가 직접 지은 서브도메인이라 실명이 들어갈 수 있다(PROJECT_PUBLISHED payload).
  // 계정 삭제 시 프로젝트 행과 함께 slug도 해제되므로 감사 가치가 낮고,
  // 언제 무슨 일이 있었는지는 projectId + 이벤트 타입 + 시각으로 충분히 남는다.
  'slug',
]);

export interface ScrubSubject {
  userId: string;
  email?: string | null;
  name?: string | null;
}

/**
 * 하이브리드 익명화:
 * 1) PII 키 denylist 제거
 * 2) 이메일(대소문자 무시)·이름 값 동등 비교 → `[redacted]`
 * 3) `userId === deletedUserId` → `[deleted]`
 * projectId·점수·duration 등 구조 필드는 유지.
 */
export function scrubEventPayload(
  payload: unknown,
  subject: ScrubSubject,
): Record<string, unknown> | null {
  if (payload == null) return null;
  const scrubbed = scrubNode(payload, subject);
  if (scrubbed != null && typeof scrubbed === 'object' && !Array.isArray(scrubbed)) {
    return scrubbed as Record<string, unknown>;
  }
  // payload 컬럼은 객체 JSON을 전제로 한다. 비객체면 빈 객체로 치환.
  return {};
}

function scrubNode(value: unknown, subject: ScrubSubject): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubNode(item, subject));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEY_DENYLIST.has(key)) continue;
      if (key === 'userId' && child === subject.userId) {
        out[key] = '[deleted]';
        continue;
      }
      out[key] = scrubNode(child, subject);
    }
    return out;
  }
  if (typeof value === 'string') {
    return scrubStringValue(value, subject);
  }
  return value;
}

function scrubStringValue(value: string, subject: ScrubSubject): string {
  const email = subject.email?.trim() ?? '';
  if (email.length > 0 && value.toLowerCase() === email.toLowerCase()) {
    return '[redacted]';
  }

  // 빈/1자 name으로 모든 짧은 문자열을 지우지 않도록 최소 길이 가드.
  const name = subject.name?.trim() ?? '';
  if (name.length >= 2 && value === name) {
    return '[redacted]';
  }

  return value;
}
