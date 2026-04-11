// Provider configuration: Supabase vs On-Premise PostgreSQL
export type DbProvider = 'supabase' | 'postgres';
export type AuthProvider = 'supabase' | 'authjs';

/**
 * 환경변수 `DB_PROVIDER`를 읽어 사용할 데이터베이스 프로바이더를 반환합니다.
 *
 * - 미설정 또는 `"supabase"` → `'supabase'` (기본값)
 * - `"postgres"` → `'postgres'` (이 경우 `DATABASE_URL`이 반드시 설정되어야 합니다)
 * - 그 외 값 → 에러를 던집니다
 *
 * @throws {Error} DB_PROVIDER가 알 수 없는 값이거나 postgres 선택 시 DATABASE_URL이 없을 때
 */
export function getDbProvider(): DbProvider {
  const provider = process.env.DB_PROVIDER;
  if (!provider || provider === 'supabase') return 'supabase';
  if (provider === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('DB_PROVIDER=postgres 설정 시 DATABASE_URL 환경변수가 필요합니다.');
    }
    return 'postgres';
  }
  throw new Error(`알 수 없는 DB_PROVIDER 값: "${provider}". "supabase" 또는 "postgres"를 사용하세요.`);
}

/**
 * 환경변수 `AUTH_PROVIDER`를 읽어 사용할 인증 프로바이더를 반환합니다.
 *
 * - 미설정 또는 `"supabase"` → `'supabase'` (기본값)
 * - `"authjs"` → `'authjs'` (이 경우 `AUTH_SECRET`이 반드시 설정되어야 합니다)
 * - 그 외 값 → 에러를 던집니다
 *
 * @throws {Error} AUTH_PROVIDER가 알 수 없는 값이거나 authjs 선택 시 AUTH_SECRET이 없을 때
 */
export function getAuthProvider(): AuthProvider {
  const provider = process.env.AUTH_PROVIDER;
  if (!provider || provider === 'supabase') return 'supabase';
  if (provider === 'authjs') {
    if (!process.env.AUTH_SECRET) {
      throw new Error('AUTH_PROVIDER=authjs 설정 시 AUTH_SECRET 환경변수가 필요합니다.');
    }
    return 'authjs';
  }
  throw new Error(`알 수 없는 AUTH_PROVIDER 값: "${provider}". "supabase" 또는 "authjs"를 사용하세요.`);
}
