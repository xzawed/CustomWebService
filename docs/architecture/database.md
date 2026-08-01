# 데이터베이스 설계

> **최종 업데이트:** 2026-07-29 (generation_locks 테이블 + user_daily_limits.suggestion_count — 총 11테이블)
> **DB:** 임베디드 SQLite (better-sqlite3 + drizzle-orm/better-sqlite3, WAL 모드)

## 사용 DB: 임베디드 SQLite (단일 인스턴스·다중 사용자)

이 서비스는 **공개 셀프서비스 회원가입 + 계정별 완전 데이터 격리** 모델이다. 데이터베이스는 외부 서버 없이
애플리케이션 프로세스에 임베드된 **SQLite 파일 1개**(`/data/app.db`)로 구동된다.

- **드라이버**: `better-sqlite3` (동기 API) + `drizzle-orm/better-sqlite3`
- **저장소**: Railway 영속 볼륨 `/data` 하위 (`SQLITE_PATH`, 기본 `/data/app.db`)
- **동시성**: WAL(Write-Ahead Logging) 모드 — 읽기/쓰기 동시성 향상. SQLite는
  한 시점에 writer가 1개뿐이므로(단일 writer), 원자성이 중요한 쓰기는 동기
  트랜잭션(`BEGIN`)으로 보강한다.
- **단일 인스턴스 전제**: 임베디드 DB이므로 멀티 인스턴스 수평 확장 불가. Railway
  단일 인스턴스 배포에 맞춰 설계됨.

> **NO Supabase, NO PostgreSQL, NO Drizzle-pg, NO Row Level Security.**
> Supabase/PostgreSQL/온프렘 Postgres 경로는 2026-06-23 컷오버로 완전히 제거되었다.
> 컷오버 배경: [docs/decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md](../decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md)

### 권한 모델: RLS 없음 → 앱 레벨 소유권 검증

SQLite에는 Row Level Security가 없다. 모든 접근 제어는 **애플리케이션 레이어**에서
처리한다. 다중 사용자 모델에서 **앱 레벨 `assertOwner` 검증이 계정 간 데이터 격리의 유일한 보안 경계**이다.
레포지토리/서비스 계층에서 `user_id` 일치를 강제한다(`assertOwner` → 불일치 시 `ForbiddenError` 403).

---

## 1. 스키마 개요

스키마의 단일 진실원천은 [`src/lib/db/sqlite/schema.ts`](../../src/lib/db/sqlite/schema.ts)
(drizzle 정의)이다. 총 **11개 테이블** (`auth_tokens` + `generation_locks` 포함):

```
┌──────────────┐           ┌────────────────────┐
│   users      │           │   api_catalog      │
├──────────────┤           ├────────────────────┤
│ id (PK)      │◄──┐       │ id (PK)            │◄──┐
│ email (UQ)   │   │       │ name               │   │
│ name         │   │       │ category           │   │
│ avatar_url   │   │       │ base_url           │   │
│ email_verified│  │       │ auth_type / config │   │
│ password_hash│   │       │ endpoints (json)   │   │
│ preferences  │   │       │ verification_status│   │
│ created_at   │   │       │ successor_id       │   │
└──────────────┘   │       └────────────────────┘   │
                   │
       ┌───────────┤ (auth_tokens)
       │           │
       ▼           │
┌──────────────┐   │
│ auth_tokens  │   │
├──────────────┤   │
│ id (PK)      │   │
│ user_id (FK) │───┤
│ token_hash   │   │
│ type         │   │
│ expires_at   │   │
│ consumed_at  │   │
└──────────────┘   │
       ┌───────────┤                                 │
       │           │                                 │
       ▼           │                                 │
┌──────────────────┐         ┌──────────────────┐    │
│    projects      │         │  project_apis    │    │
├──────────────────┤         ├──────────────────┤    │
│ id (PK)          │◄────────│ id (PK)          │    │
│ user_id (FK)     │         │ project_id (FK)  │────┤
│ name / context   │         │ api_id (FK)      │────┘
│ status           │         │ config (json)    │
│ deploy_url       │         │ UQ(project,api)  │
│ slug             │         └──────────────────┘
│ current_version  │
│ metadata (json)  │         ┌────────────────────┐
└────────┬─────────┘         │   user_api_keys    │
         │                   ├────────────────────┤
         ▼                   │ id (PK)            │
┌──────────────────┐         │ user_id (FK)       │
│ generated_codes  │         │ api_id (FK)        │
├──────────────────┤         │ encrypted_key      │
│ id (PK)          │         │ is_verified        │
│ project_id (FK)  │         │ UQ(user, api)      │
│ version          │         └────────────────────┘
│ code_html/css/js │
│ ai_provider/model│         ┌──────────────────────┐
│ token_usage(json)│         │  user_daily_limits   │
│ metadata (json)  │         ├──────────────────────┤
│ UQ(project,ver)  │         │ user_id (FK)  ┐ PK   │
└──────────────────┘         │ usage_date    ┘      │
                             │ generation_count     │
┌──────────────────────┐     │ deploy_count         │
│  platform_events     │     │ suggestion_count     │
├──────────────────────┤     └──────────────────────┘
│ id (PK)              │
│ type                 │     ┌────────────────────┐
│ payload (json)       │     │  feature_flags     │
│ user_id (FK)         │     ├────────────────────┤
│ project_id (FK)      │     │ id (PK)            │
│ created_at           │     │ flag_name (UQ)     │
└──────────────────────┘     │ enabled            │
                             │ rules (json)       │
┌──────────────────────┐     └────────────────────┘
│ generation_locks     │
├──────────────────────┤
│ project_id (PK)      │
│ user_id              │
│ acquired_at          │
│ heartbeat_at         │
└──────────────────────┘
```

> **제거된 테이블 (컷오버로 삭제됨):** `organizations` / `memberships` (Organizations 기능 제거),
> `account` / `session` / `verificationToken` (Auth.js JWT 무상태 — DB 어댑터 미사용),
> `gallery` / `project_likes` (갤러리 기능 제거), `event_log` (platform_events로 대체된 죽은 테이블).
> `projects.organization_id`·`api_catalog`의 자기참조 `successor_id` 등 일부 **컬럼**은 레포 매퍼
> 호환을 위해 nullable로 잔존하나 기능은 없고 항상 `null` 또는 미사용이다.
>
> **신규:** `auth_tokens`(2026-06-24) · `users.password_hash`(2026-06-24) · `generation_locks`(2026-07-29, 중복 생성 차단) · `user_daily_limits.suggestion_count`(2026-07-30, AI 추천 일일 쿼터, `DEFAULT 0` 필수).

---

## 2. 타입 매핑 (PostgreSQL → SQLite)

SQLite는 타입 친화성(type affinity)만 가지므로 pg 타입을 다음과 같이 매핑한다.
DB 레벨 기본값은 스칼라/boolean에만 두고, json·배열·타임스탬프는 앱(레포)·
`$defaultFn`에서 채워 drizzle-kit 직렬화 quirk를 피한다.

| PostgreSQL | SQLite | 비고 |
|------------|--------|------|
| `uuid` | `text` | `crypto.randomUUID()` (`$defaultFn`) |
| `varchar` / `text` | `text` | 길이 제약 없음 |
| `jsonb` | `text` (`mode: 'json'`) | drizzle가 자동 직렬화/역직렬화 |
| `text[]` | `text` (`mode: 'json'`, `$type<string[]>`) | JSON 배열로 저장 |
| `boolean` | `integer` (`mode: 'boolean'`) | 0/1 ↔ false/true |
| `timestamptz` | `text` | ISO 8601 문자열 (`new Date().toISOString()`) |
| `date` | `text` | `YYYY-MM-DD` 로컬 날짜 문자열 |

### UNIQUE 위반 감지

pg의 `23505`(unique_violation) 대신 SQLite는 `SQLITE_CONSTRAINT_UNIQUE` 에러 코드와
`"UNIQUE constraint failed"` 메시지를 던진다. 공용 헬퍼 `isUniqueViolation`이 이 둘을
판정하며, 슬러그 충돌 재시도(`assignUniqueSlug`) 등에서 사용한다.

---

## 3. 테이블 정의

아래 SQL은 SQLite 방언 기준이다 (drizzle 마이그레이션 `drizzle/sqlite/0000_*.sql`가 권위).

### 3.1 users (다중 사용자)

```sql
CREATE TABLE users (
    id             TEXT PRIMARY KEY,            -- randomUUID
    email          TEXT NOT NULL UNIQUE,
    name           TEXT,
    avatar_url     TEXT,
    email_verified TEXT,                        -- 인증 완료 시각(ISO8601). NULL이면 미인증
    image          TEXT,                        -- Auth.js 호환 컬럼 (미사용)
    password_hash  TEXT,                        -- scrypt "salt:hash"(hex). Credentials 계정 필수
    preferences    TEXT,                        -- json: { language, theme, ... }
    created_at     TEXT,                        -- ISO8601
    updated_at     TEXT
);
```

> **다중 사용자 모델**: `users`에는 회원가입한 모든 사용자가 행으로 존재한다. 공개 `/signup` 엔드포인트로 가입하며, 부팅 시 `seedAdminUser()`는 **제거됨** — 더 이상 단일 관리자 행을 삽입하지 않는다.
> `password_hash`는 scrypt `"salt:hash"` hex 형식. `email_verified`는 이메일 인증 완료 시각(NULL=미인증). 미인증 사용자는 로그인은 가능하나 생성·배포가 차단된다(`assertEmailVerified`).
> Auth는 무상태 JWT라 DB 어댑터/세션 테이블이 없다 — 아키텍처: [docs/architecture/auth.md](./auth.md).

### 3.2 api_catalog (API 카탈로그)

```sql
CREATE TABLE api_catalog (
    id                     TEXT PRIMARY KEY,
    name                   TEXT NOT NULL,
    description            TEXT,
    category               TEXT,
    base_url               TEXT,
    auth_type              TEXT DEFAULT 'none',
    auth_config            TEXT,                -- json
    rate_limit             TEXT,
    changelog              TEXT,                -- json (변경 이력)
    is_active              INTEGER DEFAULT 1,   -- boolean
    icon_url               TEXT,
    docs_url               TEXT,
    endpoints              TEXT,                -- json (엔드포인트 배열)
    tags                   TEXT,                -- json (string[])
    api_version            TEXT,
    deprecated_at          TEXT,
    successor_id           TEXT,                -- 자기참조(FK 제약 없음, 앱이 무결성 관리)
    cors_supported         INTEGER DEFAULT 1,   -- boolean
    requires_proxy         INTEGER DEFAULT 0,   -- boolean
    credit_required        INTEGER,
    cache_ttl_seconds      INTEGER,
    verification_status    TEXT DEFAULT 'unverified',  -- verified/degraded/broken/unverified
    verified_at            TEXT,
    last_verification_note TEXT,
    created_at             TEXT,
    updated_at             TEXT
);
```

> `verification_status`는 카탈로그 헬스 검증 결과를 보관한다(working/degraded→verified,
> broken→broken). AI 추천이 `broken`을 후보에서 제외하고 `verified`를 우선한다.
> JSONB 매퍼(`parseEndpoints` 등)는 snake_case(`example_call`)/camelCase(`exampleCall`)를
> 둘 다 처리한다.

### 3.3 projects (프로젝트)

```sql
CREATE TABLE projects (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    organization_id TEXT,                       -- 기능 제거됨, 항상 null (매퍼 호환)
    name            TEXT NOT NULL,
    context         TEXT,
    status          TEXT DEFAULT 'draft',
    deploy_url      TEXT,
    deploy_platform TEXT,
    repo_url        TEXT,
    preview_url     TEXT,
    metadata        TEXT,                       -- json
    current_version INTEGER DEFAULT 0,
    slug            TEXT,                       -- 서브도메인 퍼블리시 슬러그
    suggested_slugs TEXT,                       -- json (AI 제안 slug 목록)
    published_at    TEXT,                       -- NULL이면 미게시
    created_at      TEXT,
    updated_at      TEXT
);
```

**metadata 구조 (예):**
```json
{
  "tags": ["환율", "여행"],
  "qualityScore": 4.2,
  "lastDeployedAt": "2026-06-20T12:00:00Z"
}
```

### 3.4 project_apis (프로젝트–API 연결)

```sql
CREATE TABLE project_apis (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    api_id     TEXT NOT NULL REFERENCES api_catalog(id),
    config     TEXT,                            -- json
    created_at TEXT,
    UNIQUE(project_id, api_id)
);
```

### 3.5 generated_codes (생성 코드 버전)

```sql
CREATE TABLE generated_codes (
    id                 TEXT PRIMARY KEY,
    project_id         TEXT NOT NULL REFERENCES projects(id),
    version            INTEGER NOT NULL,
    code_html          TEXT,
    code_css           TEXT,
    code_js            TEXT,
    framework          TEXT DEFAULT 'vanilla',
    ai_provider        TEXT,                    -- anthropic
    ai_model           TEXT,                    -- claude-opus-5 등 (허용목록은 AiProviderFactory)
    ai_prompt_used     TEXT,
    generation_time_ms INTEGER,
    token_usage        TEXT,                    -- json: { input, output }
    dependencies       TEXT,                    -- json (string[])
    metadata           TEXT,                    -- json (품질 점수, 검사 결과 등)
    created_at         TEXT,
    UNIQUE(project_id, version)
);
```

### 3.6 user_api_keys (사용자 API 키 저장)

```sql
CREATE TABLE user_api_keys (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    api_id        TEXT NOT NULL REFERENCES api_catalog(id),
    encrypted_key TEXT NOT NULL,               -- ENCRYPTION_KEY로 암호화
    is_verified   INTEGER DEFAULT 0,           -- boolean
    verified_at   TEXT,
    created_at    TEXT,
    updated_at    TEXT,
    UNIQUE(user_id, api_id)
);
```

### 3.7 user_daily_limits (원자적 레이트리밋 카운터)

```sql
CREATE TABLE user_daily_limits (
    user_id          TEXT NOT NULL REFERENCES users(id),
    usage_date       TEXT NOT NULL,            -- YYYY-MM-DD (로컬 날짜)
    generation_count INTEGER DEFAULT 0,
    deploy_count     INTEGER DEFAULT 0,
    suggestion_count INTEGER DEFAULT 0,        -- AI 추천 일일 카운터 (migration 0003)
    PRIMARY KEY (user_id, usage_date)
);
```

> **`suggestion_count`의 `DEFAULT 0`은 로드 베어링이다.** ADD COLUMN 시 DEFAULT가 없으면 기존 행이 NULL이 되고 `WHERE count < limit` test-and-set이 0행 갱신 → 사용자에게 거짓 "한도 초과"로 보인다. NULL-1도 NULL이라 자가 복구도 안 된다. 마이그레이션 `0003`이 `DEFAULT 0`을 명시한다.

(원자적 test-and-set 동작은 §5 참조.)

### 3.8 platform_events (도메인 이벤트 감사 로그)

```sql
CREATE TABLE platform_events (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,                  -- PROJECT_CREATED, CODE_GENERATED 등
    payload    TEXT,                           -- json
    user_id    TEXT REFERENCES users(id),
    project_id TEXT REFERENCES projects(id),
    created_at TEXT
);
```

> `EventBus` + `eventPersister`가 전체 도메인 이벤트를 이 테이블에 자동 기록한다.

### 3.9 feature_flags (피처 플래그)

```sql
CREATE TABLE feature_flags (
    id          TEXT PRIMARY KEY,
    flag_name   TEXT NOT NULL UNIQUE,
    enabled     INTEGER DEFAULT 0,             -- boolean
    description TEXT,
    rules       TEXT,                          -- json (현재 미사용)
    updated_at  TEXT
);
```

플래그 시드 데이터는 [`src/data/featureFlags.json`](../../src/data/featureFlags.json)에서
부팅 시 멱등 삽입된다 (§4).

### 3.10 auth_tokens (이메일 인증·비밀번호 재설정 토큰)

```sql
CREATE TABLE auth_tokens (
    id          TEXT PRIMARY KEY,               -- randomUUID
    user_id     TEXT NOT NULL REFERENCES users(id),
    token_hash  TEXT NOT NULL,                  -- 토큰 원문의 SHA-256 해시 (원문 미저장)
    type        TEXT NOT NULL,                  -- 'email_verify' | 'password_reset'
    expires_at  TEXT NOT NULL,                  -- 만료 ISO8601 (email_verify: +24h, password_reset: +1h)
    consumed_at TEXT,                           -- 일회성 소비 표시 (NULL=미사용)
    created_at  TEXT
);
-- 인덱스: token_hash (조회 키)
```

> 토큰 원문(랜덤 32바이트 base64url)은 이메일 링크에만 노출되며 DB에는 **SHA-256 해시만 저장**한다.
> 사용 시 `consumed_at`을 기록해 일회성 보장. `email_verify`: 24시간 TTL, `password_reset`: 1시간 TTL.
> 재설정 완료 시 동일 user의 미소비 reset 토큰을 일괄 무효화한다.

### 3.11 generation_locks (중복 생성 차단 DB 락)

```sql
CREATE TABLE generation_locks (
    project_id   TEXT PRIMARY KEY NOT NULL,
    user_id      TEXT NOT NULL,
    acquired_at  TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL
);
```

> 인메모리 `generationTracker`는 진행률 전용. 중복 파이프라인 차단은 이 테이블의 test-and-set 락이 담당한다.
> 크래시 시 `GENERATION_LOCK_STALE_MS`(기본 5분) 후 heartbeat 기준으로 자동 탈취.

---

## 4. 마이그레이션 & 부팅 시드 (bootstrap)

### 마이그레이션

drizzle-kit으로 생성한 SQLite 마이그레이션이 `drizzle/sqlite/`에 위치한다.

```
drizzle/sqlite/
├── 0000_flaky_roulette.sql   # 초기 스키마 (9개 테이블)
├── 0001_*.sql                # auth_tokens 테이블 + users.password_hash 추가 (10개 테이블)
├── 0002_*.sql                # generation_locks 테이블 추가 (11개 테이블)
├── 0003_*.sql                # user_daily_limits.suggestion_count INTEGER DEFAULT 0
└── meta/                      # drizzle 스냅샷·저널
```

> 확정 목록은 항상 `drizzle/sqlite/` 디렉터리를 참조한다. 스키마 변경은
> `src/lib/db/sqlite/schema.ts` 수정 후 drizzle-kit으로 새 마이그레이션을 생성한다.

### 부팅 부트스트랩

`src/instrumentation.ts`(Next.js instrumentation hook)가 앱 부팅 시
`bootstrapSqlite(db)`([`src/lib/db/sqlite/bootstrap.ts`](../../src/lib/db/sqlite/bootstrap.ts))를
호출한다. 순서가 중요하며 **4단계** 모두 멱등(시드는 빈 테이블일 때만 삽입, ensure는 id 기준 신규/정정만)이라
재배포·재시작 시 안전하게 반복된다.

1. **`runSqliteMigrations(db)`** — `drizzle/sqlite`의 마이그레이션을 적용해 테이블 생성 (**11개 테이블**)
2. **`seedCatalog(db)`** — `src/data/apiCatalog.json`(프로덕션 카탈로그 미러)을 빈
   `api_catalog`에만 일괄 삽입. id·created_at은 프로덕션 값 그대로 유지(FK 일관성)
3. **`seedFeatureFlags(db)`** — `src/data/featureFlags.json`을 빈 `feature_flags`에만 삽입
4. **`ensureCatalogEntries(db)`** — 이미 시드된 DB에 번들 JSON의 **신규 행 삽입** + 잘못 broken/비활성으로 기록된 키리스 API 정정(멱등). `seedCatalog`는 빈 테이블에만 동작하므로 프로덕션 갱신에 필수

> **`seedAdminUser`는 제거됨**: 공개 다중 사용자 전환(2026-06-24)으로 env 단일 관리자 시드가 불필요해졌다. 신규 환경은 `/signup`으로 첫 사용자를 생성한다.

> 시드 데이터(`src/data/{apiCatalog,featureFlags}.json`)는 프로덕션
> `api_catalog`/`feature_flags`를 미러링한 생성 산출물이다 — 손편집 금지.
> 신규(빈) 환경 시드 전용이며, 부팅 시 빈 테이블에만 일괄 삽입된다.

### 연결 설정 (pragma)

`createSqliteConnection()`([`src/lib/db/sqlite/connection.ts`](../../src/lib/db/sqlite/connection.ts))이
다음 pragma를 적용한다:

| pragma | 값 | 목적 |
|--------|----|----|
| `foreign_keys` | `ON` | FK 제약 강제 |
| `busy_timeout` | `5000` | 쓰기 잠금 대기(ms) |
| `journal_mode` | `WAL` | 읽기/쓰기 동시성 (디스크 DB 전용; `:memory:`엔 미적용) |
| `synchronous` | `NORMAL` | 성능/내구성 균형 |

테스트는 `:memory:` 경로를 주입해 격리된 인메모리 DB로 검증한다.

---

## 5. 원자적 레이트리밋 (단일 writer test-and-set)

생성(generation)·추천(suggestion) 일일 한도는 `user_daily_limits`에 대한 **동기 트랜잭션**으로
원자적으로 강제된다 ([`src/repositories/sqlite/SqliteRateLimitRepository.ts`](../../src/repositories/sqlite/SqliteRateLimitRepository.ts)).
인터페이스 [`IRateLimitRepository`](../../src/repositories/interfaces/IRateLimitRepository.ts)는
generation·suggestion 쌍만 노출한다. **deploy 일일 한도 메서드는 제거됨**(2026-08-01, 컬럼 `deploy_count`는 스키마에만 잔존·불활성).

better-sqlite3는 동기 API이고 `db.transaction(fn)`은 `BEGIN`(단일 writer)으로 감싼다.
SQLite는 한 시점에 writer가 1개뿐이므로 다음 시퀀스가 단일 트랜잭션 안에서 원자적으로
test-and-set 된다:

```
BEGIN
  INSERT INTO user_daily_limits (user_id, usage_date, generation_count)
    VALUES (?, ?, 0) ON CONFLICT DO NOTHING;        -- 오늘 행 보장
  UPDATE user_daily_limits SET generation_count = generation_count + 1
    WHERE user_id = ? AND usage_date = ? AND generation_count < ?  -- 한도
    RETURNING generation_count;                      -- 0행이면 한도 초과
COMMIT
```

- **증가**: `RETURNING`이 행을 반환하면 허용(`true`), 0행이면 한도 도달(`false`)
- **환불**(실패 시): `SET count = MAX(0, count - 1)` (생성·추천 실패 보상, `charged===true`일 때만)
- **`usage_date`**: PG `CURRENT_DATE`에 대응하는 로컬 타임존 `YYYY-MM-DD` 문자열

> 단일 인스턴스 임베디드 전제라 외부 카운터/락이 불필요하다. 멀티 인스턴스로 전환 시
> Redis 등 외부 원자적 저장소가 필요하다.

---

## 6. 데이터 접근 계층

- **인터페이스**: [`src/repositories/interfaces/`](../../src/repositories/interfaces/)
  (IRepository seam — Provider 추상화는 이 seam만 유지)
- **구현**: [`src/repositories/sqlite/`](../../src/repositories/sqlite/) **9종**이 **유일** 구현
  (User, Project, Code, Catalog, UserApiKey, RateLimit, Event, AuthToken, **GenerationLock**)
- **팩토리**: 레포 팩토리는 무인자다. DB provider 분기는 없다. `getSqliteDb()`는 `assertSqliteEnv()`로
  환경만 검사한다 — `DB_PROVIDER` 미설정은 sqlite로 취급(경고 1회), `'sqlite'` 외의 값만 throw
  (2026-08-01 이전엔 미설정도 throw여서 env 하나로 전면 장애였다 — [ADR](../decisions/2026-08-01-db-provider-boot-gate.md)).
  (상수만 반환하던 `getDbProvider()`와 `lib/config/providers.ts`는 2026-07-10 죽은 코드 정리로 삭제됨.)
- **소유권 검증**: RLS가 없으므로 레포/서비스 계층의 앱 레벨 `assertOwner` 검증으로
  `user_id` 일치를 강제한다.

---

## 7. 스키마 확장 가이드

1. **JSONB(=text json) 메타데이터 활용 우선** — 자주 필터/정렬하지 않는 데이터는
   `metadata` json 컬럼에 추가, 자주 조회하는 데이터만 정규 컬럼 추가
2. **마이그레이션은 비파괴적(추가 위주)** — `ADD COLUMN`은 NULL 허용 또는 DEFAULT,
   `DROP COLUMN`은 유예 후 실행
3. **스키마 수정 절차** — `src/lib/db/sqlite/schema.ts` 수정 → drizzle-kit으로 새
   마이그레이션 생성 → 부팅 시 자동 적용(멱등)
4. **타입 매핑 준수** — §2의 pg→sqlite 매핑을 따르고, json/배열/타임스탬프 기본값은
   앱(`$defaultFn`)에서 채운다
