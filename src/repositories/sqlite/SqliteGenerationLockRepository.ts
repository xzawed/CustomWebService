import { and, eq, sql } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type {
  GenerationLock,
  IGenerationLockRepository,
} from '@/repositories/interfaces';

/**
 * SQLite 기반 생성 락 (임베디드 단일 writer).
 *
 * 원자성: better-sqlite3는 동기 API이고 SQLite는 한 시점에 writer가 1개뿐이다.
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE <stale> RETURNING`은 단일 문이므로
 * 조회와 획득 사이에 다른 요청이 끼어들 틈이 없다 — `SqliteRateLimitRepository`의
 * `UPDATE ... WHERE count < limit RETURNING`과 같은 test-and-set 패턴이다.
 *
 * 획득 실패는 "0행 반환"으로 나타난다: 유효한 락이 있으면 DO UPDATE의 WHERE가 거짓이 되어
 * 아무 행도 갱신되지 않고 RETURNING도 비어 있다.
 *
 * 시계를 주입받는다 — stale 판정은 시간 경과가 본질이라 실시간에 묶으면 검증할 수 없다.
 */
export class SqliteGenerationLockRepository implements IGenerationLockRepository {
  constructor(
    private db: SqliteDb,
    private now: () => number = Date.now,
  ) {}

  private iso(ms: number): string {
    return new Date(ms).toISOString();
  }

  async acquire(projectId: string, userId: string, staleMs: number): Promise<boolean> {
    const now = this.now();
    const nowIso = this.iso(now);
    // 이 시각보다 오래된 heartbeat는 죽은 것으로 본다.
    const staleBefore = this.iso(now - staleMs);

    const rows = this.db
      .insert(schema.generationLocks)
      .values({
        project_id: projectId,
        user_id: userId,
        acquired_at: nowIso,
        heartbeat_at: nowIso,
      })
      .onConflictDoUpdate({
        target: schema.generationLocks.project_id,
        set: {
          user_id: userId,
          acquired_at: nowIso,
          heartbeat_at: nowIso,
        },
        // stale한 락만 탈취한다. 유효한 락이면 0행 → 획득 실패.
        setWhere: sql`${schema.generationLocks.heartbeat_at} < ${staleBefore}`,
      })
      .returning({ projectId: schema.generationLocks.project_id })
      .all();

    return rows.length > 0;
  }

  async heartbeat(projectId: string): Promise<boolean> {
    const rows = this.db
      .update(schema.generationLocks)
      .set({ heartbeat_at: this.iso(this.now()) })
      .where(eq(schema.generationLocks.project_id, projectId))
      .returning({ projectId: schema.generationLocks.project_id })
      .all();

    return rows.length > 0;
  }

  async release(projectId: string): Promise<void> {
    this.db
      .delete(schema.generationLocks)
      .where(eq(schema.generationLocks.project_id, projectId))
      .run();
  }

  async isHeld(projectId: string, staleMs: number): Promise<boolean> {
    const staleBefore = this.iso(this.now() - staleMs);

    const row = this.db
      .select({ projectId: schema.generationLocks.project_id })
      .from(schema.generationLocks)
      .where(
        and(
          eq(schema.generationLocks.project_id, projectId),
          sql`${schema.generationLocks.heartbeat_at} >= ${staleBefore}`,
        ),
      )
      .get();

    return row !== undefined;
  }

  async find(projectId: string): Promise<GenerationLock | null> {
    const row = this.db
      .select()
      .from(schema.generationLocks)
      .where(eq(schema.generationLocks.project_id, projectId))
      .get();

    if (!row) return null;
    return {
      projectId: row.project_id,
      userId: row.user_id,
      acquiredAt: row.acquired_at,
      heartbeatAt: row.heartbeat_at,
    };
  }
}
