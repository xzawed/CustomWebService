import { eq, inArray } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { scrubEventPayload } from '@/lib/auth/scrubEventPayload';

export interface CascadeDeleteUserInput {
  userId: string;
  email: string | null;
  name: string | null;
}

/**
 * 계정 삭제용 단일 동기 트랜잭션 캐스케이드.
 *
 * `SqliteProjectRepository.delete`를 루프 호출하지 않는다 — 각 호출이 별도 트랜잭션이라
 * 중간 실패 시 반쯤 지워진 계정이 남는다. better-sqlite3 트랜잭션 안에서 await 불가.
 *
 * FK ON DELETE NO ACTION (#214 동일). generation_locks는 FK가 없어도 고아 금지.
 */
export function cascadeDeleteUser(db: SqliteDb, input: CascadeDeleteUserInput): void {
  const { userId, email, name } = input;

  db.transaction((tx) => {
    const projectRows = tx
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.user_id, userId))
      .all();
    const projectIds = projectRows.map((r) => r.id);

    // 1) 감사 로그 project_id 분리 (프로젝트 DELETE 전)
    if (projectIds.length > 0) {
      tx.update(schema.platformEvents)
        .set({ project_id: null })
        .where(inArray(schema.platformEvents.project_id, projectIds))
        .run();
    }

    // 2) 해당 사용자 이벤트: user_id NULL + payload 익명화
    const userEvents = tx
      .select({
        id: schema.platformEvents.id,
        payload: schema.platformEvents.payload,
      })
      .from(schema.platformEvents)
      .where(eq(schema.platformEvents.user_id, userId))
      .all();

    for (const row of userEvents) {
      const scrubbed = scrubEventPayload(row.payload, { userId, email, name });
      tx.update(schema.platformEvents)
        .set({ user_id: null, payload: scrubbed })
        .where(eq(schema.platformEvents.id, row.id))
        .run();
    }

    if (projectIds.length > 0) {
      // 3) 프로젝트 자식
      tx.delete(schema.generatedCodes)
        .where(inArray(schema.generatedCodes.project_id, projectIds))
        .run();
      tx.delete(schema.projectApis)
        .where(inArray(schema.projectApis.project_id, projectIds))
        .run();

      // 4) generation_locks — project_id + user_id (FK 없음)
      tx.delete(schema.generationLocks)
        .where(inArray(schema.generationLocks.project_id, projectIds))
        .run();
    }

    tx.delete(schema.generationLocks)
      .where(eq(schema.generationLocks.user_id, userId))
      .run();

    // 5) projects
    tx.delete(schema.projects).where(eq(schema.projects.user_id, userId)).run();

    // 6) 사용자 직속 자식
    tx.delete(schema.userApiKeys).where(eq(schema.userApiKeys.user_id, userId)).run();
    tx.delete(schema.authTokens).where(eq(schema.authTokens.user_id, userId)).run();
    tx.delete(schema.userDailyLimits).where(eq(schema.userDailyLimits.user_id, userId)).run();

    // 7) users 마지막
    tx.delete(schema.users).where(eq(schema.users.id, userId)).run();
  });
}
