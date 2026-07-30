import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import {
  createSqliteConnection,
  runSqliteMigrations,
  type SqliteDb,
} from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { SqliteEventRepository } from '@/repositories/sqlite/SqliteEventRepository';
import { SqliteProjectRepository } from '@/repositories/sqlite/SqliteProjectRepository';
import { cascadeDeleteUser } from './deleteAccountCascade';

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const API_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('cascadeDeleteUser', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let projectId: string;
  let eventId: string;

  beforeEach(() => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    // createSqliteConnection already sets foreign_keys=ON; re-assert for the test contract.
    expect(raw.pragma('foreign_keys', { simple: true })).toBe(1);
    runSqliteMigrations(db);

    db.insert(schema.users)
      .values({
        id: USER_ID,
        email: 'victim@example.com',
        name: 'Victim Name',
        password_hash: 'salt:hash',
      })
      .run();
    db.insert(schema.users)
      .values({ id: OTHER_ID, email: 'other@example.com', name: 'Other' })
      .run();
    db.insert(schema.apiCatalog).values({ id: API_ID, name: 'API' }).run();

    const [project] = db
      .insert(schema.projects)
      .values({
        user_id: USER_ID,
        name: 'Published Site',
        status: 'published',
        slug: 'victim-site',
        published_at: '2026-06-01T00:00:00.000Z',
      })
      .returning()
      .all();
    projectId = project.id;

    db.insert(schema.projectApis)
      .values({ project_id: projectId, api_id: API_ID, config: { a: 1 } })
      .run();
    db.insert(schema.generatedCodes)
      .values({
        project_id: projectId,
        version: 1,
        code_html: '<p>hi</p>',
        code_css: '',
        code_js: '',
      })
      .run();
    db.insert(schema.generationLocks)
      .values({
        project_id: projectId,
        user_id: USER_ID,
        acquired_at: '2026-06-01T00:00:00.000Z',
        heartbeat_at: '2026-06-01T00:00:00.000Z',
      })
      .run();
    // orphan-style lock keyed by user only (different project id string, still user_id)
    db.insert(schema.generationLocks)
      .values({
        project_id: 'orphan-project-id-no-fk',
        user_id: USER_ID,
        acquired_at: '2026-06-01T00:00:00.000Z',
        heartbeat_at: '2026-06-01T00:00:00.000Z',
      })
      .run();

    db.insert(schema.userApiKeys)
      .values({
        user_id: USER_ID,
        api_id: API_ID,
        encrypted_key: 'enc:secret',
      })
      .run();
    db.insert(schema.authTokens)
      .values({
        user_id: USER_ID,
        token_hash: 'thash',
        type: 'email_verify',
        expires_at: '2099-01-01T00:00:00.000Z',
      })
      .run();
    db.insert(schema.userDailyLimits)
      .values({
        user_id: USER_ID,
        usage_date: '2026-07-30',
        generation_count: 1,
        deploy_count: 2,
        suggestion_count: 3,
      })
      .run();

    const [ev] = db
      .insert(schema.platformEvents)
      .values({
        type: 'PROJECT_PUBLISHED',
        payload: {
          projectId,
          userId: USER_ID,
          slug: 'victim-site',
          email: 'victim@example.com',
          overallScore: 91,
          durationMs: 500,
          // 값 동등 스크럽 대상 (부분 문자열이 아닌 전체 값)
          actor: 'Victim Name',
        },
        user_id: USER_ID,
        project_id: projectId,
      })
      .returning()
      .all();
    eventId = ev.id;
  });

  afterEach(() => {
    raw.close();
  });

  it('단일 트랜잭션으로 자식을 정리하고 사용자를 삭제한다 (FK 위반 없음)', () => {
    expect(() =>
      cascadeDeleteUser(db, {
        userId: USER_ID,
        email: 'victim@example.com',
        name: 'Victim Name',
      }),
    ).not.toThrow();

    expect(
      db.select().from(schema.users).where(eq(schema.users.id, USER_ID)).get(),
    ).toBeUndefined();
    expect(
      db.select().from(schema.projects).where(eq(schema.projects.user_id, USER_ID)).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(schema.generatedCodes).where(eq(schema.generatedCodes.project_id, projectId)).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(schema.projectApis).where(eq(schema.projectApis.project_id, projectId)).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(schema.generationLocks).where(eq(schema.generationLocks.user_id, USER_ID)).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(schema.userApiKeys).where(eq(schema.userApiKeys.user_id, USER_ID)).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(schema.authTokens).where(eq(schema.authTokens.user_id, USER_ID)).all(),
    ).toHaveLength(0);
    expect(
      db
        .select()
        .from(schema.userDailyLimits)
        .where(eq(schema.userDailyLimits.user_id, USER_ID))
        .all(),
    ).toHaveLength(0);

    // 감사 로그 행은 보존
    const events = db.select().from(schema.platformEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(eventId);
    expect(events[0].user_id).toBeNull();
    expect(events[0].project_id).toBeNull();

    // 다른 사용자는 유지
    expect(
      db.select().from(schema.users).where(eq(schema.users.id, OTHER_ID)).get(),
    ).toBeDefined();
  });

  it('platform_events payload를 익명화한다 (PII 제거, 감사 필드 보존)', () => {
    cascadeDeleteUser(db, {
      userId: USER_ID,
      email: 'victim@example.com',
      name: 'Victim Name',
    });

    const row = db
      .select()
      .from(schema.platformEvents)
      .where(eq(schema.platformEvents.id, eventId))
      .get();
    expect(row?.user_id).toBeNull();
    const payload = row?.payload as Record<string, unknown>;
    expect(payload.userId).toBe('[deleted]');
    expect(payload.projectId).toBe(projectId);
    expect(payload.overallScore).toBe(91);
    expect(payload.durationMs).toBe(500);
    expect(payload.actor).toBe('[redacted]');
    expect(payload).not.toHaveProperty('email');
    expect(JSON.stringify(payload)).not.toMatch(/victim@example\.com/i);
    expect(JSON.stringify(payload)).not.toContain('Victim Name');
  });

  it('게시된 프로젝트 삭제 후 findBySlug는 null', async () => {
    cascadeDeleteUser(db, {
      userId: USER_ID,
      email: 'victim@example.com',
      name: 'Victim Name',
    });
    const projectRepo = new SqliteProjectRepository(db);
    expect(await projectRepo.findBySlug('victim-site')).toBeNull();
  });

  it('삭제 후 같은 이메일 재가입(UNIQUE) 가능', () => {
    cascadeDeleteUser(db, {
      userId: USER_ID,
      email: 'victim@example.com',
      name: 'Victim Name',
    });

    expect(() =>
      db
        .insert(schema.users)
        .values({
          email: 'victim@example.com',
          name: 'Reborn',
          password_hash: 'salt:new',
        })
        .run(),
    ).not.toThrow();
  });

  it('USER_DELETED: deletedUserId는 persist 가능, userId는 삭제 후 FK로 실패(유실)', async () => {
    cascadeDeleteUser(db, {
      userId: USER_ID,
      email: 'victim@example.com',
      name: 'Victim Name',
    });

    const eventRepo = new SqliteEventRepository(db);

    await eventRepo.persist({
      type: 'USER_DELETED',
      payload: { deletedUserId: USER_ID },
    });

    const good = db
      .select()
      .from(schema.platformEvents)
      .where(eq(schema.platformEvents.type, 'USER_DELETED'))
      .all();
    expect(good).toHaveLength(1);
    expect(good[0].user_id).toBeNull();
    expect(good[0].payload).toEqual({ deletedUserId: USER_ID });

    // payload.userId → user_id FK 추출 → 삭제된 사용자 참조 → best-effort 실패, 추가 행 없음
    await eventRepo.persist({
      type: 'USER_DELETED',
      // @ts-expect-error intentional wrong key — documents the PROJECT_DELETED trap
      payload: { userId: USER_ID },
    });
    const afterBad = db
      .select()
      .from(schema.platformEvents)
      .where(eq(schema.platformEvents.type, 'USER_DELETED'))
      .all();
    expect(afterBad).toHaveLength(1);
  });
});
