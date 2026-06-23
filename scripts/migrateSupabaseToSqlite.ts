// scripts/migrateSupabaseToSqlite.ts
// (선택적, P8.1) 기존 Supabase 프로덕션 데이터를 단일-사용자 SQLite로 이관한다.
// 셀프호스트 신규 시작이면 불필요 — 부팅 시 카탈로그·관리자만 시드되면 충분하다.
//
// 동작: 완결적(self-contained) — 대상 SQLite 파일을 만들고 마이그레이션 + 카탈로그/플래그/관리자
// 시드(번들 JSON) + Supabase 사용자 데이터(projects·project_apis·generated_codes·user_api_keys·
// user_daily_limits)를 복사한다. 모든 user_id는 단일 관리자(ADMIN_USER_ID)로 리맵한다.
// 산출된 app.db를 Railway 볼륨(/data/app.db)으로 올리면 된다. 앱 부팅의 시드는 멱등이라 충돌 없음.
//
// 사용: railway run pnpm tsx scripts/migrateSupabaseToSqlite.ts --out ./app.db [--user <supabaseUserId>]
//   (또는 .env.local 에 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 설정)
// ⚠️ user_api_keys.encrypted_key는 ENCRYPTION_KEY로 암호화돼 있다 — 새 배포가 동일 ENCRYPTION_KEY를
//    써야 복호화된다. catalog api_id는 번들 카탈로그가 프로덕션 id를 보존하므로 FK가 해소된다.
import { createClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ── .env.local 로드 (verifyPlatformKeys.ts와 동일) ──
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').replace(/^﻿/, '').replace(/\r/g, '').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && !process.env[k]) process.env[k] = v;
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const OUT = arg('--out') ?? './app.db';
const USER_FILTER = arg('--user'); // 지정 시 해당 Supabase user의 데이터만 이관(슬러그 충돌 회피 권장)
const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? '00000000-0000-0000-0000-000000000001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_NAME = process.env.ADMIN_NAME ?? 'Admin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// 컬럼별 변환: object→JSON 문자열, boolean→0/1, undefined→null
function coerce(v: unknown): unknown {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function makeInserter(db: Database.Database, table: string, columns: string[]) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
  );
  return (row: Record<string, unknown>): void => {
    stmt.run(...columns.map((c) => coerce(row[c])));
  };
}

const CATALOG_COLS = [
  'id', 'name', 'description', 'category', 'base_url', 'auth_type', 'auth_config', 'rate_limit',
  'changelog', 'is_active', 'icon_url', 'docs_url', 'endpoints', 'tags', 'api_version',
  'deprecated_at', 'successor_id', 'cors_supported', 'requires_proxy', 'credit_required',
  'cache_ttl_seconds', 'verification_status', 'verified_at', 'last_verification_note',
  'created_at', 'updated_at',
];
const PROJECT_COLS = [
  'id', 'user_id', 'organization_id', 'name', 'context', 'status', 'deploy_url', 'deploy_platform',
  'repo_url', 'preview_url', 'metadata', 'current_version', 'slug', 'suggested_slugs',
  'published_at', 'created_at', 'updated_at',
];
const PROJECT_API_COLS = ['id', 'project_id', 'api_id', 'config', 'created_at'];
const CODE_COLS = [
  'id', 'project_id', 'version', 'code_html', 'code_css', 'code_js', 'framework', 'ai_provider',
  'ai_model', 'ai_prompt_used', 'generation_time_ms', 'token_usage', 'dependencies', 'metadata',
  'created_at',
];
const KEY_COLS = ['id', 'user_id', 'api_id', 'encrypted_key', 'is_verified', 'verified_at', 'created_at', 'updated_at'];
const LIMIT_COLS = ['user_id', 'usage_date', 'generation_count', 'deploy_count'];

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

  // ── 대상 SQLite 생성 + 마이그레이션 ──
  if (fs.existsSync(OUT)) {
    console.error(`대상 파일이 이미 존재합니다: ${OUT} (덮어쓰지 않습니다. 삭제 후 재실행)`);
    process.exit(1);
  }
  const db = new Database(OUT);
  db.pragma('foreign_keys = ON');
  migrate(drizzle(db), { migrationsFolder: './drizzle/sqlite' });

  // ── 카탈로그/플래그/관리자 시드(번들 JSON, FK 해소용) ──
  const catalog = JSON.parse(fs.readFileSync('./src/data/apiCatalog.json', 'utf-8')) as Record<string, unknown>[];
  const insCatalog = makeInserter(db, 'api_catalog', CATALOG_COLS);
  for (const r of catalog) insCatalog(r);

  const flags = JSON.parse(fs.readFileSync('./src/data/featureFlags.json', 'utf-8')) as Record<string, unknown>[];
  const insFlag = makeInserter(db, 'feature_flags', ['id', 'flag_name', 'enabled', 'description', 'rules', 'updated_at']);
  const nowIso = new Date().toISOString();
  for (const r of flags) insFlag({ id: randomUUID(), updated_at: nowIso, ...r });

  db.prepare('INSERT OR IGNORE INTO users (id,email,name,created_at,updated_at) VALUES (?,?,?,?,?)').run(
    ADMIN_USER_ID, ADMIN_EMAIL, ADMIN_NAME, nowIso, nowIso,
  );

  // ── Supabase 사용자 데이터 읽기(선택적 user 필터) ──
  let pq = supabase.from('projects').select('*');
  if (USER_FILTER) pq = pq.eq('user_id', USER_FILTER);
  const { data: projects, error: pe } = await pq;
  if (pe) throw pe;
  const projectIds = (projects ?? []).map((p) => p.id as string);

  const insProject = makeInserter(db, 'projects', PROJECT_COLS);
  for (const p of projects ?? []) insProject({ ...p, user_id: ADMIN_USER_ID });

  // project_apis / generated_codes 는 이관된 project로 한정
  const inChunks = async (
    table: string,
    fk: string,
    ids: string[],
    cb: (rows: Record<string, unknown>[]) => void,
  ): Promise<void> => {
    for (let i = 0; i < ids.length; i += 100) {
      const slice = ids.slice(i, i + 100);
      const { data, error } = await supabase.from(table).select('*').in(fk, slice);
      if (error) throw error;
      cb(data ?? []);
    }
  };

  const insProjectApi = makeInserter(db, 'project_apis', PROJECT_API_COLS);
  await inChunks('project_apis', 'project_id', projectIds, (rows) => rows.forEach(insProjectApi));

  const insCode = makeInserter(db, 'generated_codes', CODE_COLS);
  await inChunks('generated_codes', 'project_id', projectIds, (rows) => rows.forEach(insCode));

  // user_api_keys / user_daily_limits — user 필터, admin으로 리맵
  let kq = supabase.from('user_api_keys').select('*');
  if (USER_FILTER) kq = kq.eq('user_id', USER_FILTER);
  const { data: keys, error: ke } = await kq;
  if (ke) throw ke;
  const insKey = makeInserter(db, 'user_api_keys', KEY_COLS);
  for (const k of keys ?? []) insKey({ ...k, user_id: ADMIN_USER_ID });

  let lq = supabase.from('user_daily_limits').select('*');
  if (USER_FILTER) lq = lq.eq('user_id', USER_FILTER);
  const { data: limits, error: le } = await lq;
  if (le) throw le;
  const insLimit = makeInserter(db, 'user_daily_limits', LIMIT_COLS);
  for (const l of limits ?? []) insLimit({ ...l, user_id: ADMIN_USER_ID });

  // ── 검증 리포트 ──
  const count = (t: string): number => (db.prepare(`SELECT count(*) c FROM ${t}`).get() as { c: number }).c;
  console.log('── 이관 완료 ──');
  console.log(`대상: ${OUT}`);
  console.log(`api_catalog=${count('api_catalog')} feature_flags=${count('feature_flags')} users=${count('users')}`);
  console.log(`projects=${count('projects')} project_apis=${count('project_apis')} generated_codes=${count('generated_codes')}`);
  console.log(`user_api_keys=${count('user_api_keys')} user_daily_limits=${count('user_daily_limits')}`);
  console.log(`모든 user_id → ${ADMIN_USER_ID} 로 리맵됨${USER_FILTER ? ` (필터 user=${USER_FILTER})` : ' (전체 사용자)'}`);
  console.log('이 파일을 Railway 볼륨 /data/app.db 로 업로드한 뒤 DB_PROVIDER=sqlite로 배포하세요.');
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
