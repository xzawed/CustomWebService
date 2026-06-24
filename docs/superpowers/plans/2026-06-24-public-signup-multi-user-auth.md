# 공개 회원가입 + 다중 사용자 인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 관리자(env 자격증명) 인증을 공개 셀프서비스 회원가입 + 계정별 완전 데이터 격리 모델로 전환한다.

**Architecture:** 기존 Auth.js v5 Credentials + scrypt + 무상태 JWT 스택을 유지하고, `authorize`를 env 한 쌍 비교에서 DB 조회(`findByEmail` + 사용자별 hash)로 교체한다. 이메일 인증·비밀번호 재설정은 `auth_tokens` 테이블 + Resend 이메일로 처리하고, 미인증 사용자는 생성/배포가 차단된다. 데이터 격리는 세션이 실제 `user.id`를 담으면 대부분 자동으로 따라오며, 직접 `projectRepo.findById`를 호출하는 라우트만 소유권 검증을 보강한다.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, better-sqlite3 + drizzle-orm, Auth.js v5(Credentials/JWT), node:crypto(scrypt/randomBytes/sha256), Resend, Zod, Vitest + happy-dom + MSW.

**설계 근거(스펙):** [docs/superpowers/specs/2026-06-24-public-signup-multi-user-auth-design.md](../specs/2026-06-24-public-signup-multi-user-auth-design.md)

## Global Constraints

- **TypeScript strict** — `any` 금지, export 함수에 명시적 반환 타입. Path alias `@/*` → `src/*`.
- **레이어**: Route Handler(`/api/v1/*`) → Service → Repository → SQLite. 라우트는 Zod 검증 후 Service 호출.
- **에러**: `@/lib/utils/errors`의 커스텀 클래스 + `handleApiError`/`jsonResponse` 사용. i18n 메시지는 `@/lib/i18n`의 `t()`(`ko.ts` + `types.ts`의 `MessageKey`).
- **테스트 DB 하니스**(SQLite 단위 테스트): `createSqliteConnection(':memory:')` → `runSqliteMigrations(db)` (beforeEach), `raw.close()` (afterEach). 기준 파일 [src/repositories/sqlite/SqliteUserRepository.test.ts](../../../src/repositories/sqlite/SqliteUserRepository.test.ts).
- **마이그레이션**: 스키마 변경 시 `pnpm drizzle-kit generate --config=drizzle.config.sqlite.ts`로 `drizzle/sqlite/`에 SQL 생성·커밋. `runSqliteMigrations`가 부팅·테스트에서 적용.
- **비밀번호 해시**: scrypt `"salt:hash"`(hex). 키 길이 64. 검증은 `timingSafeEqual`.
- **토큰**: 랜덤 32바이트 base64url 원문(이메일 링크 전용) · DB엔 SHA-256 hex 해시만 · 일회성(`consumed_at`) · 만료(verify 24h / reset 1h).
- **단일 인스턴스 전제**: 인메모리 레이트리밋 Map은 Railway 단일 인스턴스 기준(기존 `generationTracker`와 동일 제약).
- **모델 ID 등 무관 영역 변경 금지.** 카탈로그·플래그 시드는 보존.
- **테스트 실행**: `pnpm test:unit`(`src/lib src/providers src/services src/repositories`), `pnpm test:integration`(`src/__tests__/api src/app/api`), 게이트 `pnpm lint && pnpm type-check`.

---

## File Structure

**신규 파일:**
- `src/lib/auth/password.ts` — scrypt `hashPassword`/`verifyPassword` (adminCredentials에서 이전)
- `src/lib/auth/tokens.ts` — 토큰 발급/검증·소비 (auth_tokens 위에)
- `src/repositories/interfaces/IAuthTokenRepository.ts` + `src/repositories/sqlite/SqliteAuthTokenRepository.ts`
- `src/lib/email/emailService.ts` — provider 인터페이스 + Resend + no-op 폴백
- `src/services/authService.ts` — signup/verify/reset/resend 비즈니스 로직
- `src/lib/auth/rateLimit.ts` — per-IP 인메모리 슬라이딩 카운터(인증 라우트용)
- `src/lib/auth/verifiedGuard.ts` — `assertEmailVerified(userId)`
- `src/app/api/v1/auth/{signup,verify-email,resend-verification,forgot-password,reset-password}/route.ts`
- `src/app/(auth)/{signup,verify-email,forgot-password,reset-password}/page.tsx`
- `docs/decisions/2026-06-24-public-signup-multi-user-auth.md` (ADR)

**수정 파일:**
- `src/lib/db/sqlite/schema.ts`, `src/types/user.ts`, `src/repositories/sqlite/SqliteUserRepository.ts`
- `src/lib/auth/local-auth-config.ts`, `src/lib/db/sqlite/bootstrap.ts`
- `src/types/schemas.ts`, `src/lib/utils/errors.ts`, `src/lib/i18n/ko.ts`, `src/lib/i18n/types.ts`
- `src/repositories/interfaces/index.ts`, `src/repositories/sqlite/index.ts`, `src/repositories/factory.ts`
- `src/app/(auth)/login/page.tsx`
- `src/app/api/v1/generate/route.ts`, `src/app/api/v1/generate/regenerate/route.ts`, `src/app/api/v1/deploy/route.ts`
- `src/app/api/v1/preview/[projectId]/route.ts`, `src/app/api/v1/suggest-modification/route.ts`, `src/app/api/v1/projects/[id]/rollback/route.ts`, `src/app/api/v1/generate/status/[projectId]/route.ts`
- `src/test/mocks/handlers.ts`
- 문서: `CLAUDE.md`, `docs/architecture/auth.md`·`overview.md`·`database.md`, `docs/reference/env-vars.md`, `docs/guides/sqlite-cutover-runbook.md`

**제거 파일:**
- `src/lib/db/sqlite/seedAdmin.ts` + `seedAdmin.test.ts`, `src/lib/auth/adminCredentials.ts` + `adminCredentials.test.ts`, `scripts/hashAdminPassword.ts`

---

## Phase 1 — 데이터 모델 & 도메인

### Task 1: 스키마 — `users.password_hash` 컬럼 + `auth_tokens` 테이블 + 마이그레이션

**Files:**
- Modify: `src/lib/db/sqlite/schema.ts`
- Create: `drizzle/sqlite/0001_*.sql` (drizzle-kit 생성물)
- Test: `src/lib/db/sqlite/schema.test.ts` (신규)

**Interfaces:**
- Produces: `schema.users.password_hash` (text, nullable), `schema.authTokens` 테이블(컬럼: id, user_id, token_hash, type, expires_at, consumed_at, created_at)

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/db/sqlite/schema.test.ts`

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations } from '@/lib/db/sqlite/connection';

describe('schema migration: auth fields', () => {
  let raw: Database.Database;
  afterEach(() => raw.close());

  it('users 테이블에 password_hash 컬럼이 있다', () => {
    const conn = createSqliteConnection(':memory:');
    raw = conn.raw;
    runSqliteMigrations(conn.db);
    const cols = raw.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('password_hash');
  });

  it('auth_tokens 테이블이 존재하고 필요한 컬럼을 가진다', () => {
    const conn = createSqliteConnection(':memory:');
    raw = conn.raw;
    runSqliteMigrations(conn.db);
    const cols = raw.prepare(`PRAGMA table_info(auth_tokens)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'user_id', 'token_hash', 'type', 'expires_at', 'consumed_at', 'created_at']),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/db/sqlite/schema.test.ts`
Expected: FAIL — `no such table: auth_tokens` / `password_hash` 미존재

- [ ] **Step 3: 스키마 수정** — `src/lib/db/sqlite/schema.ts`

`users` 테이블에 컬럼 추가(`emailVerified` 다음 줄):

```typescript
  password_hash: text('password_hash'),
```

파일 끝(feature_flags 뒤)에 신규 테이블 추가:

```typescript
// ── 10. auth_tokens (이메일 인증 + 비밀번호 재설정 토큰) ──────────────────────
export const authTokens = sqliteTable(
  'auth_tokens',
  {
    id: uuidPk(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    token_hash: text('token_hash').notNull(),
    type: text('type').notNull(), // 'email_verify' | 'password_reset'
    expires_at: text('expires_at').notNull(),
    consumed_at: text('consumed_at'),
    created_at: createdAt(),
  },
  (t) => [index('auth_tokens_token_hash_idx').on(t.token_hash)],
);
```

`import` 줄에 `index` 추가: `import { sqliteTable, text, integer, primaryKey, unique, index } from 'drizzle-orm/sqlite-core';`

- [ ] **Step 4: 마이그레이션 생성**

Run: `pnpm drizzle-kit generate --config=drizzle.config.sqlite.ts`
Expected: `drizzle/sqlite/0001_*.sql` 생성 (ALTER TABLE users ADD password_hash; CREATE TABLE auth_tokens; CREATE INDEX)

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/db/sqlite/schema.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/db/sqlite/schema.ts src/lib/db/sqlite/schema.test.ts drizzle/sqlite/
git commit -m "feat(db): users.password_hash + auth_tokens 테이블 (다중 사용자 인증 기반)"
```

---

### Task 2: `User` 도메인 타입 확장 + 레포 매핑 (`passwordHash`, `emailVerified`)

**Files:**
- Modify: `src/types/user.ts`, `src/repositories/sqlite/SqliteUserRepository.ts:136-146` (`toDomain`)
- Test: `src/repositories/sqlite/SqliteUserRepository.test.ts` (케이스 추가)

**Interfaces:**
- Consumes: `schema.users.password_hash`, `schema.users.email_verified` (Task 1)
- Produces: `User.passwordHash: string | null`, `User.emailVerified: string | null`. `create()`는 `passwordHash`/`emailVerified`를 받아 저장(`toDatabaseRow`가 `password_hash`/`email_verified`로 자동 변환).

- [ ] **Step 1: 실패 테스트 작성** — `SqliteUserRepository.test.ts`에 `describe('auth fields')` 추가

```typescript
  describe('auth fields', () => {
    it('passwordHash와 emailVerified를 저장·반환한다', async () => {
      const created = await repo.create({
        ...baseInput,
        passwordHash: 'salt:deadbeef',
        emailVerified: null,
      });
      expect(created.passwordHash).toBe('salt:deadbeef');
      expect(created.emailVerified).toBeNull();

      const fetched = await repo.findByEmail('admin@example.com');
      expect(fetched?.passwordHash).toBe('salt:deadbeef');
      expect(fetched?.emailVerified).toBeNull();
    });
  });
```

`baseInput`은 신규 필드를 포함하도록 확장 — 파일 상단 `baseInput`에 `passwordHash: null, emailVerified: null,` 추가.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/repositories/sqlite/SqliteUserRepository.test.ts`
Expected: FAIL — `passwordHash` 타입 에러 또는 `undefined` 반환

- [ ] **Step 3: 도메인 타입 + 매핑 수정**

`src/types/user.ts`의 `User` 인터페이스에 추가:

```typescript
  passwordHash: string | null;
  emailVerified: string | null;
```

`SqliteUserRepository.ts`의 `toDomain` 반환 객체에 추가:

```typescript
      passwordHash: row.password_hash ?? null,
      emailVerified: row.email_verified ?? null,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/repositories/sqlite/SqliteUserRepository.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크** — `User`를 생성하는 다른 곳(seedAdmin 등)이 깨질 수 있으니 확인

Run: `pnpm type-check`
참고: `seedAdmin.ts`는 `schema.users`에 직접 insert하므로 도메인 `User`와 무관 → 영향 없음. 만약 다른 `User` 리터럴이 깨지면 `passwordHash: null, emailVerified: null` 추가.

- [ ] **Step 6: 커밋**

```bash
git add src/types/user.ts src/repositories/sqlite/SqliteUserRepository.ts src/repositories/sqlite/SqliteUserRepository.test.ts
git commit -m "feat(repo): User 도메인에 passwordHash·emailVerified 추가 + 매핑"
```

---

## Phase 2 — 비밀번호 & 토큰 프리미티브

### Task 3: `src/lib/auth/password.ts` — scrypt 해시 유틸 이전

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): string`("salt:hash" hex), `verifyPassword(password: string, stored: string | undefined | null): boolean`

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/auth/password.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('해시 후 같은 비밀번호로 검증 성공', () => {
    const stored = hashPassword('s3cret-pass');
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword('s3cret-pass', stored)).toBe(true);
  });
  it('틀린 비밀번호는 검증 실패', () => {
    const stored = hashPassword('s3cret-pass');
    expect(verifyPassword('wrong', stored)).toBe(false);
  });
  it('stored가 없거나 형식이 깨지면 false', () => {
    expect(verifyPassword('x', null)).toBe(false);
    expect(verifyPassword('x', undefined)).toBe(false);
    expect(verifyPassword('x', 'nocolon')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/auth/password.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `src/lib/auth/password.ts`

```typescript
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

/** 비밀번호를 scrypt 해시로 변환한다. 반환: "salt:hash"(hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** 평문 비밀번호가 저장된 "salt:hash"와 일치하는지 timing-safe 비교한다. */
export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expected);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/auth/password.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts
git commit -m "feat(auth): scrypt 비밀번호 해시 유틸 (password.ts)"
```

---

### Task 4: `IAuthTokenRepository` + `SqliteAuthTokenRepository` + factory 배선

**Files:**
- Create: `src/repositories/interfaces/IAuthTokenRepository.ts`, `src/repositories/sqlite/SqliteAuthTokenRepository.ts`, `src/repositories/sqlite/SqliteAuthTokenRepository.test.ts`
- Modify: `src/repositories/interfaces/index.ts`, `src/repositories/sqlite/index.ts`, `src/repositories/factory.ts`

**Interfaces:**
- Consumes: `schema.authTokens` (Task 1), `SqliteDb`
- Produces:
  - `AuthTokenType = 'email_verify' | 'password_reset'`
  - `IAuthTokenRepository`: `create(userId: string, tokenHash: string, type: AuthTokenType, expiresAt: string): Promise<void>`; `findValidByHash(tokenHash: string, type: AuthTokenType, now: string): Promise<{ id: string; userId: string } | null>`; `consume(id: string, now: string): Promise<void>`; `invalidateByUserAndType(userId: string, type: AuthTokenType, now: string): Promise<void>`
  - `createAuthTokenRepository(): IAuthTokenRepository`

- [ ] **Step 1: 실패 테스트 작성** — `SqliteAuthTokenRepository.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createSqliteConnection, runSqliteMigrations, type SqliteDb } from '@/lib/db/sqlite/connection';
import { SqliteUserRepository } from './SqliteUserRepository';
import { SqliteAuthTokenRepository } from './SqliteAuthTokenRepository';

describe('SqliteAuthTokenRepository', () => {
  let db: SqliteDb;
  let raw: Database.Database;
  let repo: SqliteAuthTokenRepository;
  let userId: string;

  beforeEach(async () => {
    const conn = createSqliteConnection(':memory:');
    db = conn.db;
    raw = conn.raw;
    runSqliteMigrations(db);
    repo = new SqliteAuthTokenRepository(db);
    const user = await new SqliteUserRepository(db).create({
      email: 'u@example.com', name: null, avatarUrl: null,
      preferences: {}, passwordHash: 'salt:hash', emailVerified: null,
    });
    userId = user.id;
  });
  afterEach(() => raw.close());

  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  const now = new Date().toISOString();

  it('유효한 토큰을 찾는다', async () => {
    await repo.create(userId, 'hash-a', 'email_verify', future);
    const found = await repo.findValidByHash('hash-a', 'email_verify', now);
    expect(found?.userId).toBe(userId);
  });

  it('만료된 토큰은 못 찾는다', async () => {
    await repo.create(userId, 'hash-b', 'email_verify', past);
    expect(await repo.findValidByHash('hash-b', 'email_verify', now)).toBeNull();
  });

  it('소비된 토큰은 못 찾는다', async () => {
    await repo.create(userId, 'hash-c', 'password_reset', future);
    const found = await repo.findValidByHash('hash-c', 'password_reset', now);
    await repo.consume(found!.id, now);
    expect(await repo.findValidByHash('hash-c', 'password_reset', now)).toBeNull();
  });

  it('타입이 다르면 못 찾는다', async () => {
    await repo.create(userId, 'hash-d', 'email_verify', future);
    expect(await repo.findValidByHash('hash-d', 'password_reset', now)).toBeNull();
  });

  it('invalidateByUserAndType은 해당 타입 미소비 토큰을 모두 소비 처리', async () => {
    await repo.create(userId, 'hash-e', 'password_reset', future);
    await repo.create(userId, 'hash-f', 'password_reset', future);
    await repo.invalidateByUserAndType(userId, 'password_reset', now);
    expect(await repo.findValidByHash('hash-e', 'password_reset', now)).toBeNull();
    expect(await repo.findValidByHash('hash-f', 'password_reset', now)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/repositories/sqlite/SqliteAuthTokenRepository.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 인터페이스 작성** — `src/repositories/interfaces/IAuthTokenRepository.ts`

```typescript
export type AuthTokenType = 'email_verify' | 'password_reset';

export interface IAuthTokenRepository {
  create(userId: string, tokenHash: string, type: AuthTokenType, expiresAt: string): Promise<void>;
  findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
    now: string,
  ): Promise<{ id: string; userId: string } | null>;
  consume(id: string, now: string): Promise<void>;
  invalidateByUserAndType(userId: string, type: AuthTokenType, now: string): Promise<void>;
}
```

`src/repositories/interfaces/index.ts`에 `export * from './IAuthTokenRepository';` 추가.

- [ ] **Step 4: 구현** — `src/repositories/sqlite/SqliteAuthTokenRepository.ts`

```typescript
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { SqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import type { AuthTokenType, IAuthTokenRepository } from '@/repositories/interfaces';

/** SQLite 구현 — IAuthTokenRepository. 모든 쿼리는 better-sqlite3 동기 API. */
export class SqliteAuthTokenRepository implements IAuthTokenRepository {
  constructor(private readonly db: SqliteDb) {}

  async create(userId: string, tokenHash: string, type: AuthTokenType, expiresAt: string): Promise<void> {
    this.db
      .insert(schema.authTokens)
      .values({ user_id: userId, token_hash: tokenHash, type, expires_at: expiresAt })
      .run();
  }

  async findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
    now: string,
  ): Promise<{ id: string; userId: string } | null> {
    const row = this.db
      .select({ id: schema.authTokens.id, userId: schema.authTokens.user_id })
      .from(schema.authTokens)
      .where(
        and(
          eq(schema.authTokens.token_hash, tokenHash),
          eq(schema.authTokens.type, type),
          isNull(schema.authTokens.consumed_at),
          gt(schema.authTokens.expires_at, now),
        ),
      )
      .limit(1)
      .get();
    return row ?? null;
  }

  async consume(id: string, now: string): Promise<void> {
    this.db
      .update(schema.authTokens)
      .set({ consumed_at: now })
      .where(eq(schema.authTokens.id, id))
      .run();
  }

  async invalidateByUserAndType(userId: string, type: AuthTokenType, now: string): Promise<void> {
    this.db
      .update(schema.authTokens)
      .set({ consumed_at: now })
      .where(
        and(
          eq(schema.authTokens.user_id, userId),
          eq(schema.authTokens.type, type),
          isNull(schema.authTokens.consumed_at),
        ),
      )
      .run();
  }
}
```

`src/repositories/sqlite/index.ts`에 `export { SqliteAuthTokenRepository } from './SqliteAuthTokenRepository';` 추가.

`src/repositories/factory.ts`에 추가:

```typescript
import type { IAuthTokenRepository } from '@/repositories/interfaces';
// ... SqliteAuthTokenRepository를 sqlite import 블록에 추가
export function createAuthTokenRepository(): IAuthTokenRepository {
  return new SqliteAuthTokenRepository(getSqliteDb());
}
```

> 주의: `expires_at`는 ISO8601 UTC 문자열이므로 `gt(expires_at, now)` 사전식 문자열 비교가 시간 비교와 일치한다(`created_at` 날짜 필터와 동일 원리, SqliteProjectRepository 주석 참고).

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/repositories/sqlite/SqliteAuthTokenRepository.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/repositories/interfaces/IAuthTokenRepository.ts src/repositories/interfaces/index.ts src/repositories/sqlite/SqliteAuthTokenRepository.ts src/repositories/sqlite/SqliteAuthTokenRepository.test.ts src/repositories/sqlite/index.ts src/repositories/factory.ts
git commit -m "feat(repo): AuthTokenRepository (인증/재설정 토큰 저장소)"
```

---

### Task 5: `src/lib/auth/tokens.ts` — 토큰 발급/검증·소비

**Files:**
- Create: `src/lib/auth/tokens.ts`, `src/lib/auth/tokens.test.ts`

**Interfaces:**
- Consumes: `IAuthTokenRepository` (Task 4), `AuthTokenType`
- Produces:
  - `hashToken(raw: string): string` (sha256 hex)
  - `issueToken(repo: IAuthTokenRepository, userId: string, type: AuthTokenType, ttlMs: number): Promise<string>` — 원문 반환
  - `verifyAndConsumeToken(repo: IAuthTokenRepository, raw: string, type: AuthTokenType): Promise<string | null>` — userId 반환 또는 null
  - 상수 `EMAIL_VERIFY_TTL_MS = 24*3600*1000`, `PASSWORD_RESET_TTL_MS = 3600*1000`

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/auth/tokens.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { hashToken, issueToken, verifyAndConsumeToken, EMAIL_VERIFY_TTL_MS } from './tokens';
import type { IAuthTokenRepository } from '@/repositories/interfaces';

function fakeRepo(): IAuthTokenRepository & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    create: vi.fn(async (userId, tokenHash, type, expiresAt) => {
      rows.push({ id: `t${rows.length}`, userId, tokenHash, type, expiresAt, consumed: false });
    }),
    findValidByHash: vi.fn(async (tokenHash, type) => {
      const r = rows.find((x) => x.tokenHash === tokenHash && x.type === type && !x.consumed);
      return r ? { id: r.id as string, userId: r.userId as string } : null;
    }),
    consume: vi.fn(async (id) => {
      const r = rows.find((x) => x.id === id);
      if (r) r.consumed = true;
    }),
    invalidateByUserAndType: vi.fn(async () => {}),
  };
}

describe('tokens', () => {
  it('발급한 원문 토큰의 해시가 저장되고, 같은 원문으로 검증·소비된다', async () => {
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', EMAIL_VERIFY_TTL_MS);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(repo.rows[0].tokenHash).toBe(hashToken(raw));

    const userId = await verifyAndConsumeToken(repo, raw, 'email_verify');
    expect(userId).toBe('user-1');
    // 재사용 불가(소비됨)
    expect(await verifyAndConsumeToken(repo, raw, 'email_verify')).toBeNull();
  });

  it('잘못된 토큰은 null', async () => {
    const repo = fakeRepo();
    expect(await verifyAndConsumeToken(repo, 'bogus', 'email_verify')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/auth/tokens.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `src/lib/auth/tokens.ts`

```typescript
import { randomBytes, createHash } from 'node:crypto';
import type { AuthTokenType, IAuthTokenRepository } from '@/repositories/interfaces';

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** 토큰 원문 → SHA-256 hex (DB 저장·조회용). */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** 랜덤 토큰을 발급하고 해시를 저장한다. 원문(이메일 링크용)을 반환한다. */
export async function issueToken(
  repo: IAuthTokenRepository,
  userId: string,
  type: AuthTokenType,
  ttlMs: number,
): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await repo.create(userId, hashToken(raw), type, expiresAt);
  return raw;
}

/** 원문 토큰을 검증하고 일회성으로 소비한다. 유효하면 userId, 아니면 null. */
export async function verifyAndConsumeToken(
  repo: IAuthTokenRepository,
  raw: string,
  type: AuthTokenType,
): Promise<string | null> {
  const now = new Date().toISOString();
  const found = await repo.findValidByHash(hashToken(raw), type, now);
  if (!found) return null;
  await repo.consume(found.id, now);
  return found.userId;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/auth/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/tokens.ts src/lib/auth/tokens.test.ts
git commit -m "feat(auth): 토큰 발급/검증·소비 유틸 (tokens.ts)"
```

---

## Phase 3 — 이메일 발송

### Task 6: `src/lib/email/emailService.ts` — Resend + no-op 폴백

**Files:**
- Create: `src/lib/email/emailService.ts`, `src/lib/email/emailService.test.ts`

**Interfaces:**
- Produces:
  - `sendVerificationEmail(to: string, verifyUrl: string): Promise<void>`
  - `sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>`
  - 내부: `RESEND_API_KEY` 미설정 시 콘솔 no-op. 설정 시 `https://api.resend.com/emails`로 POST(`fetch`).
- env: `RESEND_API_KEY`, `EMAIL_FROM`(기본 `'CustomWebService <onboarding@resend.dev>'`)

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/email/emailService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendVerificationEmail } from './emailService';

describe('emailService', () => {
  const orig = { ...process.env };
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => { process.env = { ...orig }; });

  it('RESEND_API_KEY 미설정 시 fetch를 호출하지 않는다(no-op)', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await sendVerificationEmail('u@example.com', 'https://x/verify?token=abc');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('RESEND_API_KEY 설정 시 Resend API로 POST한다', async () => {
    process.env.RESEND_API_KEY = 'test_key';
    process.env.EMAIL_FROM = 'App <no-reply@xzawed.xyz>';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'e1' }), { status: 200 }));
    await sendVerificationEmail('u@example.com', 'https://x/verify?token=abc');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.to).toBe('u@example.com');
    expect(body.from).toBe('App <no-reply@xzawed.xyz>');
    expect(body.html).toContain('https://x/verify?token=abc');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test_key' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/email/emailService.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `src/lib/email/emailService.ts`

```typescript
import { logger } from '@/lib/utils/logger';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'CustomWebService <onboarding@resend.dev>';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

async function send({ to, subject, html }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // dev/test 폴백: 외부 발송 없이 로그만 남긴다.
    logger.info('Email (no-op, RESEND_API_KEY 미설정)', { to, subject });
    return;
  }
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    logger.error('Email 발송 실패', { to, subject, status: res.status });
    throw new Error(`Email 발송 실패 (status ${res.status})`);
  }
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await send({
    to,
    subject: '[CustomWebService] 이메일 인증을 완료해주세요',
    html: `<p>아래 버튼을 눌러 이메일 인증을 완료해주세요. 링크는 24시간 후 만료됩니다.</p>
<p><a href="${verifyUrl}">이메일 인증하기</a></p>
<p>버튼이 동작하지 않으면 다음 주소를 브라우저에 붙여넣으세요:<br>${verifyUrl}</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await send({
    to,
    subject: '[CustomWebService] 비밀번호 재설정',
    html: `<p>아래 버튼을 눌러 비밀번호를 재설정하세요. 링크는 1시간 후 만료됩니다.</p>
<p><a href="${resetUrl}">비밀번호 재설정</a></p>
<p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`,
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/email/emailService.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/email/emailService.ts src/lib/email/emailService.test.ts
git commit -m "feat(email): Resend 발송 + no-op 폴백 (emailService)"
```

---

### Task 7: MSW 핸들러 — Resend 엔드포인트

**Files:**
- Modify: `src/test/mocks/handlers.ts`

**Interfaces:**
- Produces: `POST https://api.resend.com/emails` → `{ id: 'mock-email-id' }` 200. (컴포넌트/통합 테스트에서 미처리 요청 방지.)

- [ ] **Step 1: 핸들러 추가** — `src/test/mocks/handlers.ts`의 핸들러 배열에 추가

```typescript
  http.post('https://api.resend.com/emails', () =>
    HttpResponse.json({ id: 'mock-email-id' }, { status: 200 }),
  ),
```

(`http`, `HttpResponse`는 이미 import되어 있음 — 없으면 `import { http, HttpResponse } from 'msw';` 추가.)

- [ ] **Step 2: 회귀 확인** — 전체 단위 스위트가 여전히 통과

Run: `pnpm vitest run src/lib/email/emailService.test.ts`
Expected: PASS (핸들러는 emailService 테스트의 직접 fetch 모킹과 무관하지만, 추후 라우트 테스트에서 사용)

- [ ] **Step 3: 커밋**

```bash
git add src/test/mocks/handlers.ts
git commit -m "test(msw): Resend 엔드포인트 핸들러 추가"
```

---

## Phase 4 — 자격증명 인증(DB 조회)

### Task 8: `authorize` — env 비교 → DB 조회 + 비밀번호 검증

**Files:**
- Modify: `src/lib/auth/local-auth-config.ts`
- Test: `src/lib/auth/local-auth-config.test.ts` (신규 — authorize 함수 단위 검증)

**Interfaces:**
- Consumes: `createUserRepository()` (factory), `verifyPassword` (Task 3)
- Produces: authorize가 DB 사용자를 조회해 `{ id, email, name }` 반환(없거나 비번 불일치 시 null). `token.sub`/`session.user.id`는 실제 user.id.

> 설계: authorize 로직을 테스트 가능하도록 순수 함수 `authorizeCredentials(email, password, deps)`로 분리하고, NextAuth Credentials의 `authorize`는 이를 호출한다.

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/auth/local-auth-config.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { authorizeCredentials } from './local-auth-config';
import { hashPassword } from './password';

function depsWith(user: { id: string; email: string; name: string | null; passwordHash: string | null }) {
  return { findByEmail: vi.fn(async (email: string) => (email === user.email ? user : null)) };
}

describe('authorizeCredentials', () => {
  const user = { id: 'u-1', email: 'a@example.com', name: 'A', passwordHash: hashPassword('pw12345678') };

  it('이메일·비밀번호 일치 시 사용자 신원 반환', async () => {
    const res = await authorizeCredentials('a@example.com', 'pw12345678', depsWith(user));
    expect(res).toEqual({ id: 'u-1', email: 'a@example.com', name: 'A' });
  });
  it('비밀번호 불일치 시 null', async () => {
    expect(await authorizeCredentials('a@example.com', 'wrong', depsWith(user))).toBeNull();
  });
  it('미존재 이메일 시 null', async () => {
    expect(await authorizeCredentials('none@example.com', 'pw12345678', depsWith(user))).toBeNull();
  });
  it('passwordHash 없는 계정은 null', async () => {
    const u = { ...user, passwordHash: null };
    expect(await authorizeCredentials('a@example.com', 'pw12345678', depsWith(u))).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/auth/local-auth-config.test.ts`
Expected: FAIL — `authorizeCredentials` export 없음

- [ ] **Step 3: 구현** — `src/lib/auth/local-auth-config.ts` 교체

```typescript
// Auth.js v5 Credentials + JWT 무상태 세션 (DB 어댑터 없음) — 유일한 인증 스택.
// authorize는 DB 사용자(users)를 조회해 사용자별 비밀번호 해시를 검증한다(다중 사용자).
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyPassword } from '@/lib/auth/password';
import { createUserRepository } from '@/repositories/factory';
import { localAuthBaseConfig } from '@/lib/auth/local-auth-base';

interface AuthorizeDeps {
  findByEmail: (
    email: string,
  ) => Promise<{ id: string; email: string; name: string | null; passwordHash: string | null } | null>;
}

/** 순수 함수: 이메일/비밀번호를 DB 사용자와 대조한다. 일치 시 신원, 아니면 null. */
export async function authorizeCredentials(
  email: string,
  password: string,
  deps: AuthorizeDeps,
): Promise<{ id: string; email: string; name?: string } | null> {
  const normalized = email.trim().toLowerCase();
  const user = await deps.findByEmail(normalized);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return { id: user.id, email: user.email, name: user.name ?? undefined };
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...localAuthBaseConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        const repo = createUserRepository();
        return authorizeCredentials(email, password, { findByEmail: (e) => repo.findByEmail(e) });
      },
    }),
  ],
});
```

> 참고: `findByEmail`은 정규화된 소문자 이메일로 조회한다. 회원가입 시 이메일을 소문자로 저장하므로(Task 10) 일관된다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/auth/local-auth-config.test.ts`
Expected: PASS

- [ ] **Step 5: 타입체크 + 기존 인증 테스트 회귀**

Run: `pnpm type-check && pnpm vitest run src/lib/auth`
Expected: PASS. (구 `adminCredentials.test.ts`는 Task 22에서 제거 — 지금은 남아 통과해도 무방.)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/auth/local-auth-config.ts src/lib/auth/local-auth-config.test.ts
git commit -m "feat(auth): authorize DB 조회 + 사용자별 비밀번호 검증 (다중 사용자 로그인)"
```

---

## Phase 5 — 인증 API 라우트 & 서비스

### Task 9: 에러 클래스 + i18n 메시지 (`ConflictError`, `EmailNotVerifiedError`)

**Files:**
- Modify: `src/lib/utils/errors.ts`, `src/lib/i18n/ko.ts`, `src/lib/i18n/types.ts`
- Test: `src/lib/utils/errors.test.ts` (있으면 케이스 추가, 없으면 신규)

**Interfaces:**
- Produces: `ConflictError`(409, code `CONFLICT`), `EmailNotVerifiedError`(403, code `EMAIL_NOT_VERIFIED`). i18n 키 `error.conflict`, `error.emailNotVerified`.

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/utils/errors.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { ConflictError, EmailNotVerifiedError } from './errors';

describe('auth errors', () => {
  it('ConflictError는 409', () => {
    const e = new ConflictError('이미 가입된 이메일입니다.');
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('CONFLICT');
  });
  it('EmailNotVerifiedError는 403', () => {
    const e = new EmailNotVerifiedError();
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/utils/errors.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: 구현**

`src/lib/i18n/types.ts`의 `MessageKey` 유니온에 추가: `| 'error.conflict' | 'error.emailNotVerified'`.

`src/lib/i18n/ko.ts`의 error 블록에 추가:

```typescript
  'error.conflict': '이미 존재하는 리소스입니다.',
  'error.emailNotVerified': '이메일 인증이 필요합니다. 받은 편지함을 확인해주세요.',
```

`src/lib/utils/errors.ts`에 `RateLimitError` 다음 추가:

```typescript
export class ConflictError extends AppError {
  constructor(message = t('error.conflict')) {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor(message = t('error.emailNotVerified')) {
    super('EMAIL_NOT_VERIFIED', message, 403);
    this.name = 'EmailNotVerifiedError';
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/utils/errors.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/utils/errors.ts src/lib/utils/errors.test.ts src/lib/i18n/ko.ts src/lib/i18n/types.ts
git commit -m "feat(errors): ConflictError·EmailNotVerifiedError + i18n"
```

---

### Task 10: Zod 인증 스키마

**Files:**
- Modify: `src/types/schemas.ts`
- Test: `src/types/schemas.test.ts` (있으면 케이스 추가, 없으면 신규)

**Interfaces:**
- Produces: `signupSchema`(`{ email: string; password: string }`), `forgotPasswordSchema`(`{ email }`), `resetPasswordSchema`(`{ token: string; password: string }`), `verifyEmailSchema`(`{ token: string }`). 비밀번호 최소 8자, 이메일은 `.email()` + `.toLowerCase().trim()`.

- [ ] **Step 1: 실패 테스트 작성** — `src/types/schemas.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { signupSchema, resetPasswordSchema } from './schemas';

describe('auth schemas', () => {
  it('이메일을 소문자/trim 정규화한다', () => {
    const r = signupSchema.parse({ email: '  A@Example.COM ', password: 'pw12345678' });
    expect(r.email).toBe('a@example.com');
  });
  it('8자 미만 비밀번호는 거부', () => {
    expect(signupSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });
  it('reset은 token과 8자 이상 비밀번호 필요', () => {
    expect(resetPasswordSchema.safeParse({ token: 't', password: 'pw12345678' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: '', password: 'pw12345678' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/types/schemas.test.ts`
Expected: FAIL — export 없음

- [ ] **Step 3: 구현** — `src/types/schemas.ts`에 추가 (파일 상단 `import { z } from 'zod';` 확인)

```typescript
export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/types/schemas.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/types/schemas.ts src/types/schemas.test.ts
git commit -m "feat(schemas): 인증(signup/forgot/reset/verify) Zod 스키마"
```

---

### Task 11: `authService` — signup/verify/reset/resend 비즈니스 로직

**Files:**
- Create: `src/services/authService.ts`, `src/services/authService.test.ts`

**Interfaces:**
- Consumes: `IUserRepository`, `IAuthTokenRepository`, `hashPassword`/`verifyPassword`, `issueToken`/`verifyAndConsumeToken`, `sendVerificationEmail`/`sendPasswordResetEmail`, `ConflictError`/`ValidationError`
- Produces: `AuthService` 클래스 — 의존성 주입 생성자. 메서드:
  - `signup(email, password, baseUrl): Promise<{ userId: string }>` — 중복 시 `ConflictError`
  - `verifyEmail(token): Promise<void>` — 실패 시 `ValidationError('유효하지 않거나 만료된 링크입니다.')`
  - `resendVerification(userId, baseUrl): Promise<void>` — 이미 인증됨이면 no-op
  - `requestPasswordReset(email, baseUrl): Promise<void>` — 사용자 없어도 조용히 성공
  - `resetPassword(token, newPassword): Promise<void>` — 실패 시 `ValidationError`
- 팩토리: `createAuthService(): AuthService` (factory에서 repos·email 주입)

- [ ] **Step 1: 실패 테스트 작성** — `src/services/authService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './authService';

function makeDeps() {
  const users = new Map<string, { id: string; email: string; name: string | null; passwordHash: string | null; emailVerified: string | null }>();
  const userRepo = {
    findByEmail: vi.fn(async (email: string) => [...users.values()].find((u) => u.email === email) ?? null),
    findById: vi.fn(async (id: string) => users.get(id) ?? null),
    create: vi.fn(async (input: { email: string; passwordHash: string | null; emailVerified: string | null; name: string | null }) => {
      const u = { id: `u${users.size + 1}`, ...input, name: input.name ?? null };
      users.set(u.id, u);
      return u;
    }),
    update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const u = users.get(id)!;
      Object.assign(u, patch);
      return u;
    }),
  };
  const tokenRepo = {
    create: vi.fn(async () => {}),
    findValidByHash: vi.fn(async () => null),
    consume: vi.fn(async () => {}),
    invalidateByUserAndType: vi.fn(async () => {}),
  };
  const email = { sendVerificationEmail: vi.fn(async () => {}), sendPasswordResetEmail: vi.fn(async () => {}) };
  return { userRepo, tokenRepo, email, users };
}

describe('AuthService.signup', () => {
  let deps: ReturnType<typeof makeDeps>;
  let svc: AuthService;
  beforeEach(() => {
    deps = makeDeps();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc = new AuthService(deps.userRepo as any, deps.tokenRepo as any, deps.email as any);
  });

  it('새 이메일로 가입하면 미인증 사용자 생성 + 인증 메일 발송', async () => {
    const { userId } = await svc.signup('new@example.com', 'pw12345678', 'https://app');
    const created = deps.users.get(userId)!;
    expect(created.email).toBe('new@example.com');
    expect(created.emailVerified).toBeNull();
    expect(created.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(deps.email.sendVerificationEmail).toHaveBeenCalledOnce();
    const [, url] = deps.email.sendVerificationEmail.mock.calls[0];
    expect(url).toContain('https://app/verify-email?token=');
  });

  it('중복 이메일은 ConflictError', async () => {
    await svc.signup('dup@example.com', 'pw12345678', 'https://app');
    await expect(svc.signup('dup@example.com', 'pw12345678', 'https://app')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
```

(verify/reset/resend 케이스도 동일 파일에 추가 — Step 3 구현 후 같은 패턴으로 작성. 최소 위 두 케이스로 빨강 확인.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/services/authService.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `src/services/authService.ts`

```typescript
import type { IUserRepository, IAuthTokenRepository } from '@/repositories/interfaces';
import { hashPassword } from '@/lib/auth/password';
import {
  issueToken,
  verifyAndConsumeToken,
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from '@/lib/auth/tokens';
import { ConflictError, ValidationError } from '@/lib/utils/errors';

export interface EmailSender {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
}

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenRepo: IAuthTokenRepository,
    private readonly email: EmailSender,
  ) {}

  async signup(email: string, password: string, baseUrl: string): Promise<{ userId: string }> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) throw new ConflictError('이미 가입된 이메일입니다.');

    const user = await this.userRepo.create({
      email,
      name: null,
      avatarUrl: null,
      preferences: {},
      passwordHash: hashPassword(password),
      emailVerified: null,
    });

    await this.sendVerify(user.id, email, baseUrl);
    return { userId: user.id };
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await verifyAndConsumeToken(this.tokenRepo, token, 'email_verify');
    if (!userId) throw new ValidationError('유효하지 않거나 만료된 링크입니다.');
    await this.userRepo.update(userId, { emailVerified: new Date().toISOString() });
  }

  async resendVerification(userId: string, baseUrl: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.emailVerified) return; // 이미 인증됐거나 미존재 → no-op
    await this.sendVerify(user.id, user.email, baseUrl);
  }

  async requestPasswordReset(email: string, baseUrl: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) return; // enumeration 방지: 조용히 성공
    await this.tokenRepo.invalidateByUserAndType(user.id, 'password_reset', new Date().toISOString());
    const raw = await issueToken(this.tokenRepo, user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
    await this.email.sendPasswordResetEmail(user.email, `${baseUrl}/reset-password?token=${raw}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await verifyAndConsumeToken(this.tokenRepo, token, 'password_reset');
    if (!userId) throw new ValidationError('유효하지 않거나 만료된 링크입니다.');
    await this.userRepo.update(userId, { passwordHash: hashPassword(newPassword) });
    await this.tokenRepo.invalidateByUserAndType(userId, 'password_reset', new Date().toISOString());
  }

  private async sendVerify(userId: string, email: string, baseUrl: string): Promise<void> {
    const raw = await issueToken(this.tokenRepo, userId, 'email_verify', EMAIL_VERIFY_TTL_MS);
    await this.email.sendVerificationEmail(email, `${baseUrl}/verify-email?token=${raw}`);
  }
}
```

`src/services/factory.ts`에 추가:

```typescript
import { AuthService } from '@/services/authService';
import { createUserRepository, createAuthTokenRepository } from '@/repositories/factory';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email/emailService';

export function createAuthService(): AuthService {
  return new AuthService(createUserRepository(), createAuthTokenRepository(), {
    sendVerificationEmail,
    sendPasswordResetEmail,
  });
}
```

- [ ] **Step 4: 나머지 테스트 케이스 추가** (verify/reset/resend) 후 통과 확인

verify/reset 테스트는 `tokenRepo.findValidByHash`가 userId를 반환하도록 모킹하거나, 실제 `SqliteAuthTokenRepository`로 통합 검증한다. 최소: `verifyEmail`에 잘못된 토큰 → `ValidationError` 케이스 추가.

Run: `pnpm vitest run src/services/authService.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/services/authService.ts src/services/authService.test.ts src/services/factory.ts
git commit -m "feat(service): AuthService (signup/verify/reset/resend)"
```

---

### Task 12: per-IP 레이트리밋 헬퍼

**Files:**
- Create: `src/lib/auth/rateLimit.ts`, `src/lib/auth/rateLimit.test.ts`

**Interfaces:**
- Produces: `checkRateLimit(key: string, limit: number, windowMs: number): boolean` (한도 내 true, 초과 false), `getClientIp(request: Request): string` (`x-forwarded-for` 첫 IP 또는 `'unknown'`). 모듈 레벨 인메모리 Map(단일 인스턴스 전제).

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/auth/rateLimit.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIp } from './rateLimit';

describe('rateLimit', () => {
  it('한도까지 true, 초과 시 false', () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });
  it('getClientIp는 x-forwarded-for 첫 IP', () => {
    const req = new Request('https://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/auth/rateLimit.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `src/lib/auth/rateLimit.ts`

```typescript
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 인메모리 슬라이딩 카운터. 한도 내면 true(요청 허용), 초과면 false. 단일 인스턴스 전제. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/** 프록시(Railway) 뒤 클라이언트 IP. x-forwarded-for 첫 항목. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
}
```

> 주의: `Date.now()`는 런타임 코드에서는 사용 가능(workflow 스크립트 제약과 무관). 인메모리 Map은 재시작 시 초기화됨(분당 카운터라 보안 영향 낮음 — 기존 proxy 리밋과 동일 제약).

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/auth/rateLimit.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/rateLimit.ts src/lib/auth/rateLimit.test.ts
git commit -m "feat(auth): per-IP 인메모리 레이트리밋 헬퍼"
```

---

### Task 13: 인증 라우트 — signup / verify-email / resend-verification / forgot-password / reset-password

**Files:**
- Create: `src/app/api/v1/auth/signup/route.ts`, `.../verify-email/route.ts`, `.../resend-verification/route.ts`, `.../forgot-password/route.ts`, `.../reset-password/route.ts`
- Test: `src/__tests__/api/auth.test.ts`

**Interfaces:**
- Consumes: `createAuthService`, `getAuthUser`, auth Zod 스키마, `checkRateLimit`/`getClientIp`, `handleApiError`/`jsonResponse`/`ValidationError`/`RateLimitError`/`AuthRequiredError`
- 모든 라우트 `baseUrl`은 요청 origin(`new URL(request.url).origin`)에서 도출.
- 응답 규약: signup 201 `{ success: true }`; verify/reset 200 `{ success: true }`; forgot 200 generic; resend 200.

- [ ] **Step 1: 실패 테스트 작성** — `src/__tests__/api/auth.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// authService를 모킹해 라우트 계층(검증·상태코드·레이트리밋)만 검증한다.
const signup = vi.fn();
const verifyEmail = vi.fn();
const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
vi.mock('@/services/factory', () => ({
  createAuthService: () => ({ signup, verifyEmail, requestPasswordReset, resetPassword, resendVerification: vi.fn() }),
}));

import { POST as signupPOST } from '@/app/api/v1/auth/signup/route';
import { POST as verifyPOST } from '@/app/api/v1/auth/verify-email/route';
import { POST as forgotPOST } from '@/app/api/v1/auth/forgot-password/route';

function jsonReq(url: string, body: unknown, ip = '9.9.9.9'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('auth routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signup 성공 시 201', async () => {
    signup.mockResolvedValue({ userId: 'u1' });
    const res = await signupPOST(jsonReq('https://app/api/v1/auth/signup', { email: 'a@b.com', password: 'pw12345678' }, `ip-${Math.random()}`));
    expect(res.status).toBe(201);
    expect(signup).toHaveBeenCalledWith('a@b.com', 'pw12345678', 'https://app');
  });

  it('signup 입력 검증 실패 시 400', async () => {
    const res = await signupPOST(jsonReq('https://app/api/v1/auth/signup', { email: 'bad', password: 'x' }, `ip-${Math.random()}`));
    expect(res.status).toBe(400);
  });

  it('signup 중복은 409', async () => {
    const { ConflictError } = await import('@/lib/utils/errors');
    signup.mockRejectedValue(new ConflictError('이미 가입된 이메일입니다.'));
    const res = await signupPOST(jsonReq('https://app/api/v1/auth/signup', { email: 'a@b.com', password: 'pw12345678' }, `ip-${Math.random()}`));
    expect(res.status).toBe(409);
  });

  it('verify-email 성공 200', async () => {
    verifyEmail.mockResolvedValue(undefined);
    const res = await verifyPOST(jsonReq('https://app/api/v1/auth/verify-email', { token: 'abc' }));
    expect(res.status).toBe(200);
  });

  it('forgot-password는 항상 200(존재 여부 무관)', async () => {
    requestPasswordReset.mockResolvedValue(undefined);
    const res = await forgotPOST(jsonReq('https://app/api/v1/auth/forgot-password', { email: 'none@b.com' }, `ip-${Math.random()}`));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/__tests__/api/auth.test.ts`
Expected: FAIL — 라우트 모듈 없음

- [ ] **Step 3: 구현**

`src/app/api/v1/auth/signup/route.ts`:

```typescript
import { createAuthService } from '@/services/factory';
import { signupSchema } from '@/types/schemas';
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { ValidationError, RateLimitError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)) throw new RateLimitError();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('입력값이 올바르지 않습니다.');

    const baseUrl = new URL(request.url).origin;
    await createAuthService().signup(parsed.data.email, parsed.data.password, baseUrl);

    return jsonResponse(
      { success: true, data: { message: '가입이 완료되었습니다. 이메일 인증 링크를 확인해주세요.' } },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/v1/auth/verify-email/route.ts`:

```typescript
import { createAuthService } from '@/services/factory';
import { verifyEmailSchema } from '@/types/schemas';
import { ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('유효하지 않은 링크입니다.');

    await createAuthService().verifyEmail(parsed.data.token);
    return jsonResponse({ success: true, data: { message: '이메일 인증이 완료되었습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/v1/auth/forgot-password/route.ts`:

```typescript
import { createAuthService } from '@/services/factory';
import { forgotPasswordSchema } from '@/types/schemas';
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { ValidationError, RateLimitError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    if (!checkRateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000)) throw new RateLimitError();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('이메일 형식이 올바르지 않습니다.');

    const baseUrl = new URL(request.url).origin;
    await createAuthService().requestPasswordReset(parsed.data.email, baseUrl);

    // enumeration 방지: 존재 여부와 무관하게 동일 응답
    return jsonResponse({ success: true, data: { message: '재설정 링크를 이메일로 보냈습니다(가입된 경우).' } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/v1/auth/reset-password/route.ts`:

```typescript
import { createAuthService } from '@/services/factory';
import { resetPasswordSchema } from '@/types/schemas';
import { ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('입력값이 올바르지 않습니다.');

    await createAuthService().resetPassword(parsed.data.token, parsed.data.password);
    return jsonResponse({ success: true, data: { message: '비밀번호가 변경되었습니다. 다시 로그인해주세요.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

`src/app/api/v1/auth/resend-verification/route.ts`:

```typescript
import { getAuthUser } from '@/lib/auth/index';
import { createAuthService } from '@/services/factory';
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { AuthRequiredError, RateLimitError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const ip = getClientIp(request);
    if (!checkRateLimit(`resend:${user.id}:${ip}`, 3, 60 * 60 * 1000)) throw new RateLimitError();

    const baseUrl = new URL(request.url).origin;
    await createAuthService().resendVerification(user.id, baseUrl);
    return jsonResponse({ success: true, data: { message: '인증 메일을 다시 보냈습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/__tests__/api/auth.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/v1/auth src/__tests__/api/auth.test.ts
git commit -m "feat(api): 인증 라우트 5종 (signup/verify/resend/forgot/reset)"
```

---

## Phase 6 — 인증 UI

### Task 14: 회원가입 페이지

**Files:**
- Create: `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/signup/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/auth/signup` (MSW 핸들러 필요 — Step 1)
- 동작: 이메일·비밀번호 입력 → fetch → 성공 시 "메일 확인" 안내 표시. 로그인 페이지 스타일(login/page.tsx) 미러.

- [ ] **Step 1: MSW 핸들러 추가** — `src/test/mocks/handlers.ts`

```typescript
  http.post('*/api/v1/auth/signup', () =>
    HttpResponse.json({ success: true, data: { message: 'ok' } }, { status: 201 }),
  ),
```

- [ ] **Step 2: 실패 테스트 작성** — `src/app/(auth)/signup/page.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignupPage from './page';

describe('SignupPage', () => {
  it('가입 성공 시 이메일 확인 안내를 보여준다', async () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw12345678' } });
    fireEvent.click(screen.getByRole('button', { name: /가입/ }));
    await waitFor(() => expect(screen.getByText(/이메일.*인증/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run "src/app/(auth)/signup/page.test.tsx"`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현** — `src/app/(auth)/signup/page.tsx` (login/page.tsx의 glass 레이아웃 재사용)

```tsx
'use client';

import { useState } from 'react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? '가입 중 오류가 발생했습니다.');
      return;
    }
    setDone(true);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <div className="glass relative w-full max-w-sm rounded-2xl p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Custom</span>
            <span style={{ color: 'var(--text-primary)' }}>WebService</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">계정을 만들어 시작하세요</p>
        </div>

        {done ? (
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-sm text-cyan-300">
            가입이 완료되었습니다. <strong>{email}</strong>로 보낸 이메일 인증 링크를 확인해주세요.
            인증 후 생성·배포 기능을 사용할 수 있습니다.
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
                {error}
              </div>
            )}
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>이메일</label>
                <input id="email" name="email" type="email" autoComplete="username" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>비밀번호</label>
                <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }} />
                <p className="text-[11px] text-slate-500">8자 이상</p>
              </div>
              <button type="submit" disabled={loading}
                className="flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: 'var(--accent-gradient, linear-gradient(135deg,#06b6d4,#8b5cf6))', color: '#fff' }}>
                {loading ? '가입 중...' : '가입하기'}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-slate-500">
              이미 계정이 있으신가요? <a href="/login" className="text-cyan-400 underline">로그인</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run "src/app/(auth)/signup/page.test.tsx"`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(auth)/signup" src/test/mocks/handlers.ts
git commit -m "feat(ui): 회원가입 페이지"
```

---

### Task 15: verify-email / forgot-password / reset-password 페이지

**Files:**
- Create: `src/app/(auth)/verify-email/page.tsx`, `.../forgot-password/page.tsx`, `.../reset-password/page.tsx` + 각 `page.test.tsx`
- Modify: `src/test/mocks/handlers.ts` (verify/forgot/reset 핸들러)

**Interfaces:**
- verify-email: `useSearchParams`로 token 읽어 마운트 시 `POST /api/v1/auth/verify-email` 호출 → 성공/실패 메시지 + 대시보드 링크
- forgot-password: 이메일 입력 → `POST /api/v1/auth/forgot-password` → generic 안내
- reset-password: token(쿼리) + 새 비번 → `POST /api/v1/auth/reset-password` → 성공 시 로그인 링크

- [ ] **Step 1: MSW 핸들러 추가** — `src/test/mocks/handlers.ts`

```typescript
  http.post('*/api/v1/auth/verify-email', () => HttpResponse.json({ success: true, data: {} })),
  http.post('*/api/v1/auth/forgot-password', () => HttpResponse.json({ success: true, data: {} })),
  http.post('*/api/v1/auth/reset-password', () => HttpResponse.json({ success: true, data: {} })),
```

- [ ] **Step 2: 실패 테스트 작성** — 각 `page.test.tsx` (예: forgot-password)

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForgotPasswordPage from './page';

describe('ForgotPasswordPage', () => {
  it('제출 시 generic 안내를 보여준다', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /재설정/ }));
    await waitFor(() => expect(screen.getByText(/이메일/)).toBeInTheDocument());
  });
});
```

(verify-email은 `?token=abc`를 모의하기 위해 `next/navigation`의 `useSearchParams`를 vi.mock으로 토큰 반환하게 설정. reset-password도 동일.)

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run "src/app/(auth)/forgot-password/page.test.tsx"`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현** — 세 페이지(각각 login/page.tsx glass 레이아웃 미러, signup과 동일한 fetch 패턴). verify-email은 `'use client'` + `useEffect`로 마운트 시 1회 POST. reset-password는 `useSearchParams().get('token')`를 body에 포함.

(코드는 signup 페이지 패턴을 따르되 엔드포인트/필드만 변경 — 각 페이지 fetch 대상: verify-email→`/api/v1/auth/verify-email` {token}, forgot→`/api/v1/auth/forgot-password` {email}, reset→`/api/v1/auth/reset-password` {token,password}.)

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run "src/app/(auth)/verify-email/page.test.tsx" "src/app/(auth)/forgot-password/page.test.tsx" "src/app/(auth)/reset-password/page.test.tsx"`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(auth)/verify-email" "src/app/(auth)/forgot-password" "src/app/(auth)/reset-password" src/test/mocks/handlers.ts
git commit -m "feat(ui): 이메일 인증·비번 찾기·재설정 페이지"
```

---

### Task 16: 로그인 페이지에 회원가입·비번찾기 링크 추가

**Files:**
- Modify: `src/app/(auth)/login/page.tsx:105-108`
- Test: `src/app/(auth)/login/page.test.tsx` (케이스 추가)

- [ ] **Step 1: 실패 테스트 추가** — `login/page.test.tsx`

```typescript
  it('회원가입·비밀번호 찾기 링크가 있다', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /회원가입/ })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: /비밀번호/ })).toHaveAttribute('href', '/forgot-password');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run "src/app/(auth)/login/page.test.tsx"`
Expected: FAIL — 링크 없음

- [ ] **Step 3: 구현** — `login/page.tsx`의 하단 `<p>...이용약관...</p>` 위에 추가

```tsx
        <div className="mt-6 flex items-center justify-between text-xs">
          <a href="/signup" className="text-cyan-400 underline">회원가입</a>
          <a href="/forgot-password" className="text-slate-400 underline">비밀번호를 잊으셨나요?</a>
        </div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run "src/app/(auth)/login/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(auth)/login/page.tsx" "src/app/(auth)/login/page.test.tsx"
git commit -m "feat(ui): 로그인에 회원가입·비번찾기 링크"
```

---

## Phase 7 — 데이터 격리 & 인증 게이트

### Task 17: `assertEmailVerified` 게이트 + generate/regenerate/deploy 적용

**Files:**
- Create: `src/lib/auth/verifiedGuard.ts`, `src/lib/auth/verifiedGuard.test.ts`
- Modify: `src/app/api/v1/generate/route.ts:31`, `src/app/api/v1/generate/regenerate/route.ts:35`, `src/app/api/v1/deploy/route.ts:13` (각 `getAuthUser` + `AuthRequiredError` 직후)

**Interfaces:**
- Consumes: `IUserRepository.findById`, `EmailNotVerifiedError` (Task 9)
- Produces: `assertEmailVerified(userId: string): Promise<void>` — `emailVerified`가 null이면 `EmailNotVerifiedError` throw

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/auth/verifiedGuard.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

const findById = vi.fn();
vi.mock('@/repositories/factory', () => ({ createUserRepository: () => ({ findById }) }));

import { assertEmailVerified } from './verifiedGuard';

describe('assertEmailVerified', () => {
  it('미인증이면 EMAIL_NOT_VERIFIED throw', async () => {
    findById.mockResolvedValue({ id: 'u1', emailVerified: null });
    await expect(assertEmailVerified('u1')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });
  it('인증됨이면 통과', async () => {
    findById.mockResolvedValue({ id: 'u1', emailVerified: '2026-06-24T00:00:00.000Z' });
    await expect(assertEmailVerified('u1')).resolves.toBeUndefined();
  });
  it('사용자 미존재면 throw', async () => {
    findById.mockResolvedValue(null);
    await expect(assertEmailVerified('u1')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/auth/verifiedGuard.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `src/lib/auth/verifiedGuard.ts`

```typescript
import { createUserRepository } from '@/repositories/factory';
import { EmailNotVerifiedError } from '@/lib/utils/errors';

/** 이메일 인증 여부를 강제한다. 미인증·미존재 시 EmailNotVerifiedError(403). */
export async function assertEmailVerified(userId: string): Promise<void> {
  const user = await createUserRepository().findById(userId);
  if (!user || !user.emailVerified) throw new EmailNotVerifiedError();
}
```

각 라우트의 `if (!user) throw new AuthRequiredError();` 바로 다음 줄에 추가(+ import):

```typescript
import { assertEmailVerified } from '@/lib/auth/verifiedGuard';
// ...
    if (!user) throw new AuthRequiredError();
    await assertEmailVerified(user.id);
```

- [ ] **Step 4: 통과 + 회귀 확인**

Run: `pnpm vitest run src/lib/auth/verifiedGuard.test.ts && pnpm vitest run src/__tests__/api/generate.test.ts`
Expected: PASS (generate 통합 테스트가 사용자 인증 모킹을 한다면 `findById`가 verified 사용자를 반환하도록 조정 필요 — 실패 시 해당 테스트의 user 모킹에 `emailVerified` 부여)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/verifiedGuard.ts src/lib/auth/verifiedGuard.test.ts src/app/api/v1/generate/route.ts src/app/api/v1/generate/regenerate/route.ts src/app/api/v1/deploy/route.ts
git commit -m "feat(auth): 미인증 사용자 생성·배포 차단 게이트"
```

---

### Task 18: 소유권 검증 보강 — 직접 `findById` 호출 라우트

**Files:**
- Modify: `src/app/api/v1/preview/[projectId]/route.ts`, `src/app/api/v1/suggest-modification/route.ts`, `src/app/api/v1/projects/[id]/rollback/route.ts`, `src/app/api/v1/generate/status/[projectId]/route.ts`
- Test: `src/__tests__/api/ownership-isolation.test.ts` (신규)

**Interfaces:**
- Consumes: `assertOwner(project, user.id)` (`@/lib/auth/authorize`) — 패턴 기준: `src/app/api/v1/projects/[id]/slug/check/route.ts:38-40`
- 규칙: `projectRepo.findById(projectId)` 직후 `if (!project) → NotFoundError/적절 처리; assertOwner(project, user.id);`. `status` 라우트는 기존 `not_found` 규약 유지(미존재·타인 소유 모두 `not_found` 반환).

> **proxy 라우트 제외 사유**: `proxy/route.ts:208`의 `findById`는 게시된 사이트가 런타임에 자기 API 키를 해결하는 경로로, 소유권 의미가 다르다(공개 사이트 서빙). 본 태스크에서 변경하지 않으며, Step 1에서 별도 주석으로 사유를 남긴다.

- [ ] **Step 1: 실패 테스트 작성** — `src/__tests__/api/ownership-isolation.test.ts`

각 라우트에 대해 "타인 소유 project 접근 시 403(또는 status는 not_found)"을 검증. `getAuthUser`를 user B로 모킹하고 `projectRepo.findById`가 user A 소유 project를 반환하도록 모킹 → preview/suggest-modification/rollback은 403, status는 `{ status: 'not_found' }`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAuthUser = vi.fn();
vi.mock('@/lib/auth/index', () => ({ getAuthUser }));
const findById = vi.fn();
vi.mock('@/repositories/factory', async (orig) => ({
  ...(await orig<typeof import('@/repositories/factory')>()),
  createProjectRepository: () => ({ findById }),
}));

import { GET as previewGET } from '@/app/api/v1/preview/[projectId]/route';

describe('ownership isolation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('preview: 타인 소유 프로젝트 접근 시 403', async () => {
    getAuthUser.mockResolvedValue({ id: 'user-B', email: 'b@x', name: null, avatarUrl: null });
    findById.mockResolvedValue({ id: 'p1', userId: 'user-A' });
    const res = await previewGET(new Request('https://app/api/v1/preview/p1'), { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(403);
  });
});
```

(suggest-modification·rollback도 동일 패턴 케이스 추가. status는 `not_found` 단언.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/__tests__/api/ownership-isolation.test.ts`
Expected: FAIL — 현재 소유권 미검증으로 403이 아님

- [ ] **Step 3: 구현** — 각 라우트에 `assertOwner` 삽입

`preview/[projectId]/route.ts`, `suggest-modification/route.ts`, `projects/[id]/rollback/route.ts`: `findById` 결과 null 체크 직후 추가(+import `import { assertOwner } from '@/lib/auth/authorize';`):

```typescript
    if (!project) throw new NotFoundError('프로젝트', projectId);
    assertOwner(project, user.id);
```

`generate/status/[projectId]/route.ts`: 기존 not_found 규약에 맞춰, `findById` 후 `project가 없거나 project.userId !== user.id`이면 `{ status: 'not_found' }` 반환(throw 대신 분기 — 폴링 클라이언트가 'not_found'를 전용 처리하므로, CLAUDE.md의 `pollGenerationStatus` 규약 유지).

`proxy/route.ts:208`: 변경 없음 + 주석 추가:

```typescript
    // NOTE: 공개 사이트 런타임이 자기 프로젝트의 API 키를 해결하는 경로 — 소유권은
    // 게시 사이트 서빙 의미상 적용하지 않는다(다중 사용자 격리는 '관리/편집'에만 적용).
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/__tests__/api/ownership-isolation.test.ts`
Expected: PASS

- [ ] **Step 5: 회귀 — 전체 통합 스위트**

Run: `pnpm test:integration`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/v1/preview src/app/api/v1/suggest-modification src/app/api/v1/projects/[id]/rollback src/app/api/v1/generate/status src/app/api/v1/proxy/route.ts src/__tests__/api/ownership-isolation.test.ts
git commit -m "fix(security): 직접 findById 라우트 소유권 검증 보강 (다중 사용자 격리)"
```

---

### Task 19: 대시보드 미인증 배너 + 재발송 버튼

**Files:**
- Modify: 대시보드 페이지(`src/app/(main)/dashboard/page.tsx` 또는 해당 클라이언트 컴포넌트 — 실제 경로는 구현 시 확인)
- Create: `src/components/dashboard/VerifyEmailBanner.tsx` + 테스트

**Interfaces:**
- Consumes: `GET /api/v1/auth/me` 또는 세션 — **간단화**: 신규 경량 라우트 `GET /api/v1/auth/status` → `{ verified: boolean }`(현재 사용자 `emailVerified` 여부). 배너는 미인증 시만 노출, "인증 메일 재발송" 버튼은 `POST /api/v1/auth/resend-verification` 호출.

- [ ] **Step 1: `GET /api/v1/auth/status` 라우트 + 테스트** (verified 여부 반환)

```typescript
// src/app/api/v1/auth/status/route.ts
import { getAuthUser } from '@/lib/auth/index';
import { createUserRepository } from '@/repositories/factory';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

export async function GET(): Promise<Response> {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();
    const dbUser = await createUserRepository().findById(user.id);
    return jsonResponse({ success: true, data: { verified: Boolean(dbUser?.emailVerified) } });
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 2: `VerifyEmailBanner` 컴포넌트 + 테스트** — 마운트 시 `/api/v1/auth/status` fetch, `verified === false`이면 배너 + 재발송 버튼 렌더. MSW 핸들러 추가(`*/api/v1/auth/status` → `{verified:false}`, `*/api/v1/auth/resend-verification` → 200).

- [ ] **Step 3: 대시보드에 배너 마운트** — 대시보드 상단에 `<VerifyEmailBanner />` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/components/dashboard/VerifyEmailBanner.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/v1/auth/status src/components/dashboard/VerifyEmailBanner.tsx src/components/dashboard/VerifyEmailBanner.test.tsx src/test/mocks/handlers.ts "src/app/(main)/dashboard"
git commit -m "feat(ui): 미인증 이메일 배너 + 재발송"
```

---

## Phase 8 — 정리 & 문서

### Task 20: 단일 관리자 잔재 제거 (seedAdmin · adminCredentials · env · admin:hash)

**Files:**
- Delete: `src/lib/db/sqlite/seedAdmin.ts`, `src/lib/db/sqlite/seedAdmin.test.ts`, `src/lib/auth/adminCredentials.ts`, `src/lib/auth/adminCredentials.test.ts`, `scripts/hashAdminPassword.ts`
- Modify: `src/lib/db/sqlite/bootstrap.ts`, `src/lib/db/sqlite/bootstrap.test.ts`, `package.json`(`admin:hash` 스크립트 제거), 잔여 import 사용처

**Interfaces:**
- Produces: bootstrap는 `seedAdminUser` 호출 없이 `runSqliteMigrations` + `seedCatalog` + `seedFeatureFlags`만.

- [ ] **Step 1: 의존성 추적** — 제거 대상 심볼 사용처 확인

Run: `pnpm grep` 대신 검색 — `verifyAdminCredentials`, `getAdminUserId`, `seedAdminUser`, `hashPassword`(adminCredentials의 것), `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_USER_ID` 참조를 모두 나열.
Expected: `bootstrap.ts`(seedAdminUser), `seedAdmin.ts`(getAdminUserId) 외 잔여 없음(authorize는 Task 8에서 이미 교체됨). `getAdminUserId`를 import하던 곳이 있으면 정리.

- [ ] **Step 2: bootstrap 수정 + 테스트 갱신**

`src/lib/db/sqlite/bootstrap.ts`:

```typescript
import { runSqliteMigrations, type SqliteDb } from './connection';
import { seedCatalog, seedFeatureFlags } from './seedCatalog';

/** SQLite 부팅 부트스트랩. 마이그레이션 후 카탈로그·플래그를 멱등 시드한다(관리자 시드 제거 — 공개 회원가입). */
export function bootstrapSqlite(db: SqliteDb): void {
  runSqliteMigrations(db);
  seedCatalog(db);
  seedFeatureFlags(db);
}
```

`bootstrap.test.ts`에서 seedAdmin 관련 단언 제거.

- [ ] **Step 3: 파일 삭제 + package.json 정리**

```bash
git rm src/lib/db/sqlite/seedAdmin.ts src/lib/db/sqlite/seedAdmin.test.ts src/lib/auth/adminCredentials.ts src/lib/auth/adminCredentials.test.ts scripts/hashAdminPassword.ts
```

`package.json`에서 `"admin:hash": "tsx scripts/hashAdminPassword.ts"` 라인 제거.

- [ ] **Step 4: 타입체크 + 전체 단위 통과**

Run: `pnpm type-check && pnpm test:unit`
Expected: PASS (잔여 import 에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "refactor(auth): 단일 관리자 잔재 제거 (seedAdmin·adminCredentials·admin:hash·env)"
```

---

### Task 21: 문서 최신화 + ADR + 런북 (프로덕션 클린 리셋 절차)

**Files:**
- Modify: `CLAUDE.md`, `docs/architecture/auth.md`, `docs/architecture/overview.md`, `docs/architecture/database.md`, `docs/reference/env-vars.md`, `docs/guides/sqlite-cutover-runbook.md`
- Create: `docs/decisions/2026-06-24-public-signup-multi-user-auth.md` (ADR)

- [ ] **Step 1: ADR 작성** — 결정/배경/대안(A/B/C안)/영향 기록, 스펙·플랜 링크.

- [ ] **Step 2: 아키텍처/스키마 문서 갱신** — `auth.md`·`overview.md`·`database.md`에서 "단일 관리자/셀프호스트 단일 사용자" 서술을 "공개 회원가입 다중 사용자 + 계정별 격리"로 수정. `users`는 N행, `auth_tokens` 테이블 추가, `password_hash` 컬럼 반영.

- [ ] **Step 3: env-vars 갱신** — `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_USER_ID` 제거, `RESEND_API_KEY`/`EMAIL_FROM` 추가. `ADMIN_API_KEY`(진단용)는 유지 명시.

- [ ] **Step 4: 런북에 클린 리셋 절차 추가** — `sqlite-cutover-runbook.md`에 섹션 추가:
  1. `/data/app.db` 백업(`cp`)
  2. `users`/`projects`/`project_apis`/`generated_codes`/`user_api_keys`/`user_daily_limits`/`platform_events` DELETE (카탈로그·플래그 보존)
  3. 재시작 후 첫 회원가입이 첫 사용자
  4. ⚠️ 게시 사이트 다운 경고 + Resend 도메인 인증(SPF/DKIM) 사용자 작업 안내

- [ ] **Step 5: CLAUDE.md 갱신** — 기술 스택 표 Auth 행, 환경변수 섹션, "문서 참조" 표에 ADR 추가, Gotchas의 단일 사용자 전제 서술 수정.

- [ ] **Step 6: 커밋**

```bash
git add CLAUDE.md docs/
git commit -m "docs: 공개 회원가입 다중 사용자 인증 — 문서 최신화 + ADR + 런북"
```

---

### Task 22: 최종 검증 게이트

- [ ] **Step 1: 전체 파이프라인**

Run: `pnpm lint && pnpm type-check && pnpm test:coverage`
Expected: PASS (lint·type 0 에러, 테스트 그린)

- [ ] **Step 2: standalone 헬스체크** (Edge 호환 회귀 — middleware 인증 게이팅)

Run: `pnpm test:prod` (있으면) 또는 `pnpm build`
Expected: 빌드 성공, `/api/v1/health` 200

- [ ] **Step 3: 수동 흐름 점검(로컬)** — 회원가입 → (no-op 이메일 로그에서 토큰 확인) → `/verify-email?token=` → 로그인 → 생성 시도(인증 전 403 / 인증 후 통과) → 비번 재설정 흐름. PR 본문에 결과 기록.

---

## Self-Review (작성자 점검 완료)

**Spec coverage**: 스펙 §2(데이터 모델)=Task1·2 / §3(인증 흐름)=Task8·11·13·14·15 / §4.1(격리)=Task18 / §4.2(게이트)=Task17 / §5(이메일)=Task6·7 / §6(보안)=Task5·9·12 / §7(제거·리셋)=Task20·21 / §8(테스트)=각 태스크 TDD + Task22 / §9(에러)=Task9. 누락 없음.

**Placeholder scan**: 모든 코드 스텝에 실제 코드 포함. Task15·19는 동일 패턴 반복을 명시적으로 "signup 패턴 미러"로 지시(코드 중복 방지 + 엔드포인트/필드 차이 명시) — 실행자가 Task14의 완성 코드를 기준 삼음.

**Type consistency**: `User.passwordHash`/`emailVerified`(Task2) → repo·authService·authorizeCredentials·verifiedGuard 전반 일관. `IAuthTokenRepository` 시그니처(Task4) → tokens.ts(Task5)·authService(Task11) 일관. `AuthService` 생성자(userRepo, tokenRepo, email) → factory(Task11) 일관. 에러 코드 `CONFLICT`/`EMAIL_NOT_VERIFIED`(Task9) → 라우트·게이트 테스트 일관.

> **알려진 한계(스펙 §6)**: 비번 재설정 후 기존 JWT 세션 즉시 무효화는 무상태 전략상 미지원. reset 토큰 일회성만 보장.
</content>
