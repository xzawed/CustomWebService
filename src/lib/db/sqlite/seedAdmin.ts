import { eq } from 'drizzle-orm';
import type { SqliteDb } from './connection';
import * as schema from './schema';
import { getAdminUserId } from '@/lib/auth/adminCredentials';

/**
 * 단일 관리자 `users` 행을 멱등 시드한다 (AUTH_PROVIDER=local + DB_PROVIDER=sqlite 부팅 경로).
 *
 * Credentials authorize가 반환하는 관리자 신원(`getAdminUserId()`)은 `users.id`(FK 앵커)와
 * 일치해야 한다. 그렇지 않으면 관리자가 프로젝트를 만들 때 `projects.user_id` FK가 깨진다.
 * 따라서 부팅 시 이 행을 보장한다.
 *
 * - `ADMIN_EMAIL` 미설정 시 no-op (로컬 인증 비활성 — 시드할 신원이 없음).
 * - 이미 동일 id 행이 있으면 덮어쓰지 않는다 (재배포 멱등).
 *
 * @returns 새로 시드했으면 `true`, 미설정·이미 존재 시 `false`.
 */
export function seedAdminUser(db: SqliteDb): boolean {
  const email = process.env.ADMIN_EMAIL;
  if (!email) return false;

  const id = getAdminUserId();
  const existing = db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get();
  if (existing) return false;

  const now = new Date().toISOString();
  db.insert(schema.users)
    .values({
      id,
      email,
      name: process.env.ADMIN_NAME ?? 'Admin',
      created_at: now,
      updated_at: now,
    })
    .run();

  return true;
}
