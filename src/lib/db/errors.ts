/**
 * UNIQUE 제약 위반 에러 감지 (임베디드 SQLite).
 *
 * better-sqlite3는 UNIQUE/PRIMARY KEY 위반 시 `SqliteError`(Error 인스턴스)를 던지며
 *  - `code`: `'SQLITE_CONSTRAINT_UNIQUE'` 또는 `'SQLITE_CONSTRAINT_PRIMARYKEY'`
 *  - `message`: `'UNIQUE constraint failed: <table>.<column>'`
 * 형태다. 레거시 Postgres(`23505`) 형태도 무해하게 함께 인식한다(과거 데이터/테스트 호환).
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error) return false;

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code: unknown }).code
      : undefined;

  // SQLite (better-sqlite3)
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return true;
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
    return true;
  }

  // 레거시 Postgres 23505 (무해한 폴백)
  if (code === '23505') return true;
  if (error instanceof Error && error.message.includes('23505')) return true;

  return false;
}
