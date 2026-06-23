// scripts/generateSqliteSeed.ts
// 프로덕션 api_catalog/feature_flags를 읽어 src/data/{apiCatalog,featureFlags}.json을 재생성한다.
// 이 JSON은 SQLite 부팅 시드(src/lib/db/sqlite/seedCatalog.ts)가 import하는 원본이다
// (countries.json 생성 패턴과 동일한 준-정적 산출물 — 커밋·번들).
//
// 실행: railway run pnpm seed:generate   (또는 .env.local에 SUPABASE 키 설정 후 pnpm seed:generate)
// 키 값은 출력하지 않는다.
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// .env.local 로드 (verifyPlatformKeys.ts와 동일)
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// SQLite 스키마와 1:1 정렬되는 컬럼만 선택(seedCatalog가 그대로 insert).
const CATALOG_COLUMNS = [
  'id', 'name', 'description', 'category', 'base_url', 'auth_type', 'auth_config',
  'rate_limit', 'changelog', 'is_active', 'icon_url', 'docs_url', 'endpoints', 'tags',
  'api_version', 'deprecated_at', 'successor_id', 'cors_supported', 'requires_proxy',
  'credit_required', 'cache_ttl_seconds', 'verification_status', 'verified_at',
  'last_verification_note', 'created_at', 'updated_at',
].join(',');

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

  const { data: catalog, error: e1 } = await supabase
    .from('api_catalog')
    .select(CATALOG_COLUMNS)
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  if (e1) throw e1;

  const { data: flags, error: e2 } = await supabase
    .from('feature_flags')
    .select('flag_name,enabled,description,rules')
    .order('flag_name', { ascending: true });
  if (e2) throw e2;

  const dataDir = path.resolve(process.cwd(), 'src/data');
  fs.writeFileSync(path.join(dataDir, 'apiCatalog.json'), JSON.stringify(catalog ?? [], null, 2) + '\n', 'utf-8');
  fs.writeFileSync(path.join(dataDir, 'featureFlags.json'), JSON.stringify(flags ?? [], null, 2) + '\n', 'utf-8');

  const active = (catalog ?? []).filter((r) => (r as { is_active?: boolean }).is_active).length;
  console.log(`✓ src/data/apiCatalog.json: ${catalog?.length ?? 0} rows (${active} active)`);
  console.log(`✓ src/data/featureFlags.json: ${flags?.length ?? 0} flags`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
