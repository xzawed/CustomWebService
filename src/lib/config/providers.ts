// Provider configuration: Supabase vs On-Premise PostgreSQL
import { isInFailover } from '@/lib/db/failover';

export type DbProvider = 'supabase' | 'postgres';
export type AuthProvider = 'supabase' | 'authjs';

let _cachedDbProvider: DbProvider | undefined;
let _cachedAuthProvider: AuthProvider | undefined;

/**
 * 환경변수 `DB_PROVIDER`를 읽어 사용할 데이터베이스 프로바이더를 반환합니다.
 * 최초 호출 시 환경변수를 검증하고 결과를 메모이제이션합니다.
 * postgres 모드에서 failover가 활성화된 경우 'supabase'를 반환합니다.
 *
 * - 미설정 또는 `"supabase"` → `'supabase'` (기본값)
 * - `"postgres"` → `'postgres'` (이 경우 `DATABASE_URL`이 반드시 설정되어야 합니다)
 * - 그 외 값 → 에러를 던집니다
 *
 * @throws {Error} DB_PROVIDER가 알 수 없는 값이거나 postgres 선택 시 DATABASE_URL이 없을 때
 */
export function getDbProvider(): DbProvider {
  // failover 활성 시 supabase 반환 (캐시값이 postgres인 경우에만 적용)
  if (_cachedDbProvider === 'postgres' && isInFailover()) {
    return 'supabase';
  }
  if (_cachedDbProvider) return _cachedDbProvider;
  const provider = process.env.DB_PROVIDER;
  let result: DbProvider;
  if (!provider || provider === 'supabase') {
    result = 'supabase';
  } else if (provider === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DB_PROVIDER=postgres 설정 시 DATABASE_URL 환경변수가 필요합니다.');
    }
    result = 'postgres';
  } else {
    throw new Error(`알 수 없는 DB_PROVIDER 값: "${provider}". "supabase" 또는 "postgres"를 사용하세요.`);
  }
  _cachedDbProvider = result;
  return _cachedDbProvider;
}

/**
 * 환경변수 `AUTH_PROVIDER`를 읽어 사용할 인증 프로바이더를 반환합니다.
 * 최초 호출 시 환경변수를 검증하고 결과를 메모이제이션합니다.
 * authjs 모드에서 failover가 활성화된 경우 'supabase'를 반환합니다.
 *
 * - 미설정 또는 `"supabase"` → `'supabase'` (기본값)
 * - `"authjs"` → `'authjs'` (이 경우 `AUTH_SECRET`이 반드시 설정되어야 합니다)
 * - 그 외 값 → 에러를 던집니다
 *
 * @throws {Error} AUTH_PROVIDER가 알 수 없는 값이거나 authjs 선택 시 AUTH_SECRET이 없을 때
 */
export function getAuthProvider(): AuthProvider {
  // failover 활성 시 supabase 반환 (캐시값이 authjs인 경우에만 적용)
  if (_cachedAuthProvider === 'authjs' && isInFailover()) {
    return 'supabase';
  }
  if (_cachedAuthProvider) return _cachedAuthProvider;
  const provider = process.env.AUTH_PROVIDER;
  let result: AuthProvider;
  if (!provider || provider === 'supabase') {
    result = 'supabase';
  } else if (provider === 'authjs') {
    if (!process.env.AUTH_SECRET) {
      throw new Error('AUTH_PROVIDER=authjs 설정 시 AUTH_SECRET 환경변수가 필요합니다.');
    }
    result = 'authjs';
  } else {
    throw new Error(`알 수 없는 AUTH_PROVIDER 값: "${provider}". "supabase" 또는 "authjs"를 사용하세요.`);
  }
  _cachedAuthProvider = result;
  return _cachedAuthProvider;
}

/**
 * 테스트 전용: 프로바이더 캐시를 초기화하여 환경변수 변경이 반영되도록 합니다.
 * 프로덕션 코드에서 호출하지 마세요.
 */
export function _resetProviderCache(): void {
  _cachedDbProvider = undefined;
  _cachedAuthProvider = undefined;
}
