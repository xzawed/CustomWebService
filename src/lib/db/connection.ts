import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDb | null = null;
let _pool: Pool | null = null;

export function getDb(): DrizzleDb {
  if (_db) return _db;

  if (process.env.DB_PROVIDER !== 'postgres') {
    throw new Error('getDb()는 DB_PROVIDER=postgres 환경에서만 사용할 수 있습니다.');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  }

  // 풀 설정은 배포 환경(DB 성능·네트워크)에 따라 튜닝할 수 있도록 환경변수로 노출(기본값 폴백).
  _pool = new Pool({
    connectionString,
    max: Number.parseInt(process.env.DB_POOL_MAX ?? '', 10) || 10,
    idleTimeoutMillis: Number.parseInt(process.env.DB_IDLE_TIMEOUT_MS ?? '', 10) || 30000,
    connectionTimeoutMillis: Number.parseInt(process.env.DB_CONNECTION_TIMEOUT_MS ?? '', 10) || 5000,
  });

  _db = drizzle(_pool, { schema });
  return _db;
}

/**
 * Drizzle 연결과 pg.Pool을 정리하고 초기화합니다.
 * failover 시 호출되어 stale 연결을 제거합니다.
 */
export async function resetDbConnection(): Promise<void> {
  if (_pool) {
    await _pool.end().catch(() => {});
    _pool = null;
  }
  _db = null;
}
