/**
 * Postgres 23505 UNIQUE 위반 에러 감지.
 * Supabase(PostgREST: plain object { code: '23505' })와
 * Drizzle(Error instance, message에 '23505' 포함) 양쪽 모두 지원.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error) return false;

  // Supabase / PostgREST plain object
  if (typeof error === 'object' && 'code' in error) {
    return (error as { code: unknown }).code === '23505';
  }

  // Drizzle / node-postgres Error instance
  if (error instanceof Error) {
    return error.message.includes('23505') || ('code' in error && (error as NodeJS.ErrnoException).code === '23505');
  }

  return false;
}
