// scripts/verifyPlatformKeys.ts
// Run with the platform secrets available in the environment, e.g. on Railway:
//   railway run pnpm keys:verify
// or locally after exporting the API_KEY_* vars.
//
// 카탈로그의 "플랫폼 키 의존" API(auth_type=api_key + auth_config.env_var, default_key 없음)에 대해
// 환경변수에 등록된 키로 업스트림에 실제 인증 요청을 보내 키 유효성을 검증한다.
// 검증 로직은 src/lib/catalog/keyCheck.ts(단위 테스트 대상)에 위임 — 프록시와 동일 주입 +
// raw 실패 시 prefix("KakaoAK "/"Client-ID ") 적용 재시도(needsPrefixFix 보고).
//
// ⚠️ Railway "sealed variables" 주의: 봉인된 변수는 `railway run`(로컬 CLI)에 주입되지 않는다
//    (배포 런타임에만 주입) → 봉인 키는 로컬 실행 시 전부 MISSING(가짜 음성). 봉인 키 유효성은
//    배포 컨텍스트 안(관리자 엔드포인트 /api/v1/admin/keys-verify)에서 검증해야 한다.
//
// 키 값은 절대 출력하지 않는다. MISSING/INVALID가 하나라도 있으면 exit code 1.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { verifyApiKey, type KeyCheckApi, type KeyFetch, type KeyCheckResult } from '../src/lib/catalog/keyCheck';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').replace(/^﻿/, '').replace(/\r/g, '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const realFetch: KeyFetch = async (url, headers) => {
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    const ct = res.headers.get('content-type') ?? '';
    const bodyText = /json|text|xml/i.test(ct) ? (await res.text()).slice(0, 4000) : '';
    return { status: res.status, bodyText, networkError: false };
  } catch {
    return { status: 0, bodyText: '', networkError: true };
  }
};

interface CatalogRow {
  name: string;
  base_url: string;
  auth_config: (KeyCheckApi['authConfig'] & { default_key?: string }) | null;
  endpoints: KeyCheckApi['endpoints'];
}

async function main(): Promise<void> {
  const { data, error } = await supabase
    .from('api_catalog')
    .select('name, base_url, auth_type, auth_config, endpoints')
    .eq('is_active', true)
    .eq('auth_type', 'api_key')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch catalog:', error.message);
    process.exit(1);
  }

  // default_key가 있는 항목(예: NASA DEMO_KEY)은 "플랫폼 비밀 키 의존"이 아니므로 제외
  const keyed = ((data ?? []) as CatalogRow[]).filter(
    (a) => a.auth_config?.env_var && !a.auth_config?.default_key,
  );

  const results: KeyCheckResult[] = [];
  for (const a of keyed) {
    const api: KeyCheckApi = {
      name: a.name,
      baseUrl: a.base_url,
      authConfig: a.auth_config,
      endpoints: a.endpoints,
    };
    const key = a.auth_config?.env_var ? process.env[a.auth_config.env_var] : undefined;
    results.push(await verifyApiKey(api, key, realFetch));
  }

  process.stderr.write('\n===== Platform key validity =====\n');
  for (const r of results) {
    const flag = r.needsPrefixFix ? ' ⚠️prefix-fix' : '';
    process.stderr.write(
      `  [${r.verdict.padEnd(12)}] ${r.name}  (${r.envVar})  ${r.httpStatus ?? ''}  ${r.detail}${flag}\n`,
    );
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

  const bad = results.filter((r) => r.verdict === 'MISSING' || r.verdict === 'INVALID');
  if (bad.length > 0) {
    process.stderr.write(`\n❌ ${bad.length} key(s) MISSING/INVALID.\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
