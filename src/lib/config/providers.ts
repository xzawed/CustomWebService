// Provider configuration: 임베디드 SQLite + Auth.js(local) 단일 스택.
// 과거의 Supabase/on-prem Postgres(Drizzle) 경로는 SQLite 컷오버(2026-06-23) 후 제거됨.
// getDbProvider/getAuthProvider는 더 이상 분기하지 않지만, 호출처(레포 팩토리·테스트 모킹 경계)를
// 단순 유지하기 위해 함수 형태를 보존한다.

export type DbProvider = 'sqlite';
export type AuthProvider = 'local';

/**
 * 데이터베이스 프로바이더를 반환합니다. 임베디드 SQLite 단일 스택이므로 항상 `'sqlite'`.
 */
export function getDbProvider(): DbProvider {
  return 'sqlite';
}

/**
 * 인증 프로바이더를 반환합니다. Auth.js Credentials 단일 관리자 + JWT(무상태) 단일 스택이므로
 * 항상 `'local'`. JWT 서명을 위해 `AUTH_SECRET`이 반드시 설정되어야 합니다.
 *
 * @throws {Error} `AUTH_SECRET` 환경변수가 없을 때
 */
export function getAuthProvider(): AuthProvider {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET 환경변수가 필요합니다 (Auth.js JWT 세션 서명용).');
  }
  return 'local';
}

/**
 * 테스트 전용: 과거 프로바이더 캐시 호환을 위한 no-op. 현재는 캐시가 없습니다.
 * 프로덕션 코드에서 호출하지 마세요.
 */
export function _resetProviderCache(): void {
  // no-op — 단일 프로바이더 스택이라 캐시할 상태가 없음
}
