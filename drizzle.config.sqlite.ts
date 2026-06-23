import type { Config } from 'drizzle-kit';

// 임베디드 SQLite 경로용 drizzle-kit 설정 (DB_PROVIDER=sqlite).
// 마이그레이션 산출물은 ./drizzle/sqlite 에 생성·커밋한다.
export default {
  schema: './src/lib/db/sqlite/schema.ts',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_PATH ?? './data/app.db',
  },
} satisfies Config;
