/**
 * SQLite 스키마 (임베디드 단일 인스턴스·단일 사용자 경로).
 *
 * pg 스키마(`src/lib/db/schema.ts`)를 SQLite 방언으로 미러링한다. 단일 사용자/셀프호스트
 * 결정에 따라 다음 테이블은 제외된다:
 *  - organizations / memberships (Organizations 기능 제거, D-1)
 *  - account / session / verificationToken (Auth.js JWT 세션 전략 — DB 어댑터 미사용)
 *  - event_log (platform_events로 대체된 죽은 테이블)
 *
 * 타입 매핑: uuid→text(randomUUID), varchar/text→text, jsonb→text(mode:json),
 * boolean→integer(mode:boolean), timestamptz→text(ISO8601), date→text(YYYY-MM-DD),
 * text[]→text(mode:json $type<string[]>). DB 레벨 기본값은 스칼라/boolean에만 두고,
 * json/배열/타임스탬프는 앱(레포)·$defaultFn에서 채워 drizzle-kit 직렬화 quirk를 피한다.
 */
import { sqliteTable, text, integer, primaryKey, unique, index } from 'drizzle-orm/sqlite-core';

const uuidPk = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () => text('created_at').$defaultFn(() => new Date().toISOString());
const updatedAt = () => text('updated_at').$defaultFn(() => new Date().toISOString());

// ── 1. users (단일 관리자 1행 운용) ───────────────────────────────────────────
export const users = sqliteTable('users', {
  id: uuidPk(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatar_url: text('avatar_url'),
  email_verified: text('email_verified'),
  password_hash: text('password_hash'),
  image: text('image'),
  preferences: text('preferences', { mode: 'json' }).$type<Record<string, unknown>>(),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

// ── 2. api_catalog ────────────────────────────────────────────────────────────
export const apiCatalog = sqliteTable('api_catalog', {
  id: uuidPk(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  base_url: text('base_url'),
  auth_type: text('auth_type').default('none'),
  auth_config: text('auth_config', { mode: 'json' }).$type<Record<string, unknown>>(),
  rate_limit: text('rate_limit'),
  changelog: text('changelog', { mode: 'json' }).$type<unknown[]>(),
  is_active: integer('is_active', { mode: 'boolean' }).default(true),
  icon_url: text('icon_url'),
  docs_url: text('docs_url'),
  endpoints: text('endpoints', { mode: 'json' }).$type<unknown[]>(),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  api_version: text('api_version'),
  deprecated_at: text('deprecated_at'),
  // 자기참조(successor_id)는 FK 제약 없이 컬럼만 보존 (단일 인스턴스, 무결성은 앱이 관리)
  successor_id: text('successor_id'),
  cors_supported: integer('cors_supported', { mode: 'boolean' }).default(true),
  requires_proxy: integer('requires_proxy', { mode: 'boolean' }).default(false),
  credit_required: integer('credit_required'),
  cache_ttl_seconds: integer('cache_ttl_seconds'),
  verification_status: text('verification_status').default('unverified'),
  verified_at: text('verified_at'),
  last_verification_note: text('last_verification_note'),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

// ── 3. projects ───────────────────────────────────────────────────────────────
export const projects = sqliteTable('projects', {
  id: uuidPk(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id),
  // organizations 테이블은 제외되었으나 컬럼은 nullable로 보존(레포 매퍼 호환, 항상 null)
  organization_id: text('organization_id'),
  name: text('name').notNull(),
  context: text('context'),
  status: text('status').default('draft'),
  deploy_url: text('deploy_url'),
  deploy_platform: text('deploy_platform'),
  repo_url: text('repo_url'),
  preview_url: text('preview_url'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  current_version: integer('current_version').default(0),
  slug: text('slug'),
  suggested_slugs: text('suggested_slugs', { mode: 'json' }).$type<string[]>(),
  published_at: text('published_at'),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

// ── 4. project_apis ───────────────────────────────────────────────────────────
export const projectApis = sqliteTable(
  'project_apis',
  {
    id: uuidPk(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id),
    api_id: text('api_id')
      .notNull()
      .references(() => apiCatalog.id),
    config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
    created_at: createdAt(),
  },
  (t) => [unique().on(t.project_id, t.api_id)],
);

// ── 5. generated_codes ────────────────────────────────────────────────────────
export const generatedCodes = sqliteTable(
  'generated_codes',
  {
    id: uuidPk(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id),
    version: integer('version').notNull(),
    code_html: text('code_html'),
    code_css: text('code_css'),
    code_js: text('code_js'),
    framework: text('framework').default('vanilla'),
    ai_provider: text('ai_provider'),
    ai_model: text('ai_model'),
    ai_prompt_used: text('ai_prompt_used'),
    generation_time_ms: integer('generation_time_ms'),
    token_usage: text('token_usage', { mode: 'json' }).$type<Record<string, unknown>>(),
    dependencies: text('dependencies', { mode: 'json' }).$type<string[]>(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    created_at: createdAt(),
  },
  (t) => [unique().on(t.project_id, t.version)],
);

// ── 6. user_api_keys ──────────────────────────────────────────────────────────
export const userApiKeys = sqliteTable(
  'user_api_keys',
  {
    id: uuidPk(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    api_id: text('api_id')
      .notNull()
      .references(() => apiCatalog.id),
    encrypted_key: text('encrypted_key').notNull(),
    is_verified: integer('is_verified', { mode: 'boolean' }).default(false),
    verified_at: text('verified_at'),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (t) => [unique().on(t.user_id, t.api_id)],
);

// ── 7. user_daily_limits (원자적 레이트리밋 카운터) ───────────────────────────
export const userDailyLimits = sqliteTable(
  'user_daily_limits',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    usage_date: text('usage_date').notNull(),
    generation_count: integer('generation_count').default(0),
    deploy_count: integer('deploy_count').default(0),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.usage_date] })],
);

// ── 8. platform_events (감사 로그) ────────────────────────────────────────────
export const platformEvents = sqliteTable('platform_events', {
  id: uuidPk(),
  type: text('type').notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
  user_id: text('user_id').references(() => users.id),
  project_id: text('project_id').references(() => projects.id),
  created_at: createdAt(),
});

// ── 9. feature_flags ──────────────────────────────────────────────────────────
export const featureFlags = sqliteTable('feature_flags', {
  id: uuidPk(),
  flag_name: text('flag_name').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).default(false),
  description: text('description'),
  rules: text('rules', { mode: 'json' }).$type<Record<string, unknown>>(),
  updated_at: updatedAt(),
});

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

// ── 11. generation_locks (프로젝트별 생성 락 — durable) ───────────────────────
//
// `generationTracker`(인메모리 LRU+TTL)가 락을 겸하던 구조에서는 엔트리가 TTL이나
// size cap으로 사라지면 락도 함께 사라져 같은 projectId로 두 번째 파이프라인이 시작될 수
// 있었다(Opus/ET 이중 청구 + `getNextVersion()` 충돌). 락 책임만 DB로 분리한다.
//
// **FK를 두지 않는다.** 수명이 짧은 운영 상태이고, `project_id` FK가 있으면 스테일 락이
// 남은 프로젝트의 삭제가 FK 위반으로 실패한다(admin/test-generation의 cleanup 경로가 실제로
// 그렇다). 무결성은 stale 만료(heartbeat_at)와 release가 담당한다.
//
// 시각은 다른 테이블과 동일하게 ISO8601 UTC 문자열로 저장한다 — 고정 폭이라
// `heartbeat_at < ?` 사전식 비교가 시간 비교와 일치한다.
//
// `retention.ts` 정리 대상에 넣지 않았다: 행은 projectId로 유일하고 정상 경로에서 해제되므로
// 상한이 **프로젝트 수**다. 트래픽에 선형 비례하는 `platform_events`와 성격이 다르다.
// (생성 도중 프로젝트가 삭제되면 행 1개가 고아로 남지만 다음 동명 projectId가 덮어쓴다.)
export const generationLocks = sqliteTable('generation_locks', {
  project_id: text('project_id').primaryKey(),
  user_id: text('user_id').notNull(),
  acquired_at: text('acquired_at').notNull(),
  heartbeat_at: text('heartbeat_at').notNull(),
});
