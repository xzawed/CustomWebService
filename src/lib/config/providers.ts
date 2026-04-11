// Provider configuration: Supabase vs On-Premise PostgreSQL
export type DbProvider = 'supabase' | 'postgres';
export type AuthProvider = 'supabase' | 'authjs';

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
