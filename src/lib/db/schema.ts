import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  date,
  primaryKey,
  unique,
  foreignKey,
} from 'drizzle-orm/pg-core';

// ── 1. users ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  avatar_url: text('avatar_url'),
  // Auth.js (next-auth v5) @auth/drizzle-adapter 필수 컬럼
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  preferences: jsonb('preferences').default({}),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── 2. organizations ──────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  plan: varchar('plan', { length: 50 }).default('free'),
  settings: jsonb('settings').default({}),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── 3. memberships ────────────────────────────────────────────────────────────

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: varchar('role', { length: 50 }).default('member'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.user_id, t.organization_id)],
);

// ── 4. api_catalog ────────────────────────────────────────────────────────────

export const apiCatalog = pgTable('api_catalog', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  base_url: text('base_url'),
  auth_type: varchar('auth_type', { length: 50 }).default('none'),
  auth_config: jsonb('auth_config').default({}),
  rate_limit: varchar('rate_limit', { length: 100 }),
  changelog: jsonb('changelog').default([]),
  is_active: boolean('is_active').default(true),
  icon_url: text('icon_url'),
  docs_url: text('docs_url'),
  endpoints: jsonb('endpoints').default([]),
  tags: text('tags').array(),
  api_version: varchar('api_version', { length: 50 }),
  deprecated_at: timestamp('deprecated_at', { withTimezone: true }),
  successor_id: uuid('successor_id'),
  cors_supported: boolean('cors_supported').default(true),
  requires_proxy: boolean('requires_proxy').default(false),
  credit_required: integer('credit_required'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Self-referential FK for successor_id (defined separately to avoid circular ref)
export const apiCatalogSuccessorFk = foreignKey({
  columns: [apiCatalog.successor_id],
  foreignColumns: [apiCatalog.id],
  name: 'api_catalog_successor_id_fkey',
});

// ── 5. projects ───────────────────────────────────────────────────────────────

export const projects = pgTable('projects', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  organization_id: uuid('organization_id').references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  context: text('context'),
  status: varchar('status', { length: 50 }).default('draft'),
  deploy_url: text('deploy_url'),
  deploy_platform: varchar('deploy_platform', { length: 100 }),
  repo_url: text('repo_url'),
  preview_url: text('preview_url'),
  metadata: jsonb('metadata').default({}),
  current_version: integer('current_version').default(0),
  slug: text('slug'),
  published_at: timestamp('published_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── 6. project_apis ───────────────────────────────────────────────────────────

export const projectApis = pgTable(
  'project_apis',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    api_id: uuid('api_id')
      .notNull()
      .references(() => apiCatalog.id),
    config: jsonb('config').default({}),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.project_id, t.api_id)],
);

// ── 7. generated_codes ────────────────────────────────────────────────────────

export const generatedCodes = pgTable(
  'generated_codes',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    project_id: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    version: integer('version').notNull(),
    code_html: text('code_html'),
    code_css: text('code_css'),
    code_js: text('code_js'),
    framework: varchar('framework', { length: 50 }).default('vanilla'),
    ai_provider: varchar('ai_provider', { length: 100 }),
    ai_model: varchar('ai_model', { length: 100 }),
    ai_prompt_used: text('ai_prompt_used'),
    generation_time_ms: integer('generation_time_ms'),
    token_usage: jsonb('token_usage').default({}),
    dependencies: text('dependencies').array(),
    metadata: jsonb('metadata').default({}),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.project_id, t.version)],
);

// ── 8. user_api_keys ──────────────────────────────────────────────────────────

export const userApiKeys = pgTable(
  'user_api_keys',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    api_id: uuid('api_id')
      .notNull()
      .references(() => apiCatalog.id),
    encrypted_key: text('encrypted_key').notNull(),
    is_verified: boolean('is_verified').default(false),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.user_id, t.api_id)],
);

// ── 9. user_daily_limits ──────────────────────────────────────────────────────

export const userDailyLimits = pgTable(
  'user_daily_limits',
  {
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    usage_date: date('usage_date').defaultNow(),
    generation_count: integer('generation_count').default(0),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.usage_date] })],
);

// ── 10. platform_events ───────────────────────────────────────────────────────

export const platformEvents = pgTable('platform_events', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  type: text('type').notNull(),
  payload: jsonb('payload').default({}),
  user_id: uuid('user_id').references(() => users.id),
  project_id: uuid('project_id').references(() => projects.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── 11. feature_flags ─────────────────────────────────────────────────────────

export const featureFlags = pgTable('feature_flags', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  flag_name: varchar('flag_name', { length: 100 }).notNull().unique(),
  enabled: boolean('enabled').default(false),
  description: text('description'),
  rules: jsonb('rules').default({}),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── 12. Auth.js (next-auth v5) 필수 테이블 ────────────────────────────────────
// @auth/drizzle-adapter v1.x 가 요구하는 스키마 (pg-core 기준)

export const accounts = pgTable(
  'account',
  {
    userId: uuid('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: uuid('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);
