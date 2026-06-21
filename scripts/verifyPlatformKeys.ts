// scripts/verifyPlatformKeys.ts
// Run with the platform secrets available in the environment, e.g. on Railway:
//   railway run pnpm keys:verify
// or locally after exporting the API_KEY_* vars.
//
// 카탈로그의 "플랫폼 키 의존" API(auth_type=api_key + auth_config.env_var, default_key 없음)에 대해
// 환경변수에 등록된 키로 업스트림에 실제 인증 요청을 보내 키 유효성을 검증한다.
//
// 중요: 프록시(src/app/api/v1/proxy/route.ts)의 resolveApiKey와 동일하게 키를 주입한다
//       (header면 raw 값, query면 raw 값). 따라서 Kakao "KakaoAK "/Unsplash "Client-ID " 같은
//       prefix가 환경변수 값에 포함돼야 하는 경우, 누락 시 INVALID로 드러난다 = 프로덕션과 동일한 진실.
//
// ⚠️ Railway "sealed variables" 주의: 봉인된 변수는 `railway run`(로컬 CLI)에 주입되지 않는다
//    (배포 런타임에만 주입). 따라서 봉인된 키는 로컬에서 실행하면 모두 MISSING으로 나온다 — 가짜 음성.
//    봉인 키의 유효성을 검증하려면 이 스크립트를 *배포 컨텍스트 안*에서 실행해야 한다
//    (예: 관리자 전용 진단 엔드포인트 또는 배포 환경의 일회성 잡). 로컬 `railway run`은 비봉인 변수만 검증 가능.
//
// 키 값은 절대 출력하지 않는다. 결과: VALID / INVALID / MISSING / RATE_LIMITED / ERROR.
// MISSING 또는 INVALID가 하나라도 있으면 exit code 1.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { buildTestUrl, looksLikeErrorBody, type TestableEndpoint } from '../src/lib/catalog/healthCheck';

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

type Verdict = 'VALID' | 'INVALID' | 'MISSING' | 'RATE_LIMITED' | 'ERROR';

interface AuthConfig {
  param_name?: string;
  param_in?: string;
  env_var?: string;
  default_key?: string;
}

interface KeyResult {
  name: string;
  envVar: string;
  verdict: Verdict;
  httpStatus?: number;
  detail: string;
}

async function verifyKey(api: {
  name: string;
  base_url: string;
  auth_config: AuthConfig | null;
  endpoints: Array<TestableEndpoint & { method?: string }> | null;
}): Promise<KeyResult> {
  const cfg = api.auth_config ?? {};
  const envVar = cfg.env_var ?? '';
  const key = envVar ? process.env[envVar] : undefined;

  if (!envVar) return { name: api.name, envVar: '(none)', verdict: 'ERROR', detail: 'env_var 미정의' };
  if (!key) return { name: api.name, envVar, verdict: 'MISSING', detail: '환경변수 미설정' };

  const getEp = (api.endpoints ?? []).find((e) => (e.method ?? 'GET') === 'GET');
  if (!getEp) return { name: api.name, envVar, verdict: 'ERROR', detail: 'GET 엔드포인트 없음' };

  const url = new URL(buildTestUrl(api.base_url, getEp));
  const headers: Record<string, string> = {
    'User-Agent': 'CustomWebService-KeyVerify/1.0',
    Accept: 'application/json',
  };

  // 프록시와 동일한 주입 (raw 값)
  if (cfg.param_name) {
    if (cfg.param_in === 'header') headers[cfg.param_name] = key;
    else url.searchParams.set(cfg.param_name, key);
  }

  try {
    const res = await fetch(url.toString(), {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    const status = res.status;
    const ct = res.headers.get('content-type') ?? '';
    const body = /json|text|xml/i.test(ct) ? (await res.text()).slice(0, 4000) : '';

    if (status === 401 || status === 403) {
      return { name: api.name, envVar, verdict: 'INVALID', httpStatus: status, detail: '키 거부(주입 형식/만료 확인)' };
    }
    if (status === 429) {
      return { name: api.name, envVar, verdict: 'RATE_LIMITED', httpStatus: status, detail: '429 — 키는 통과, 한도 초과' };
    }
    if (status >= 200 && status < 400) {
      if (looksLikeErrorBody(body)) {
        return { name: api.name, envVar, verdict: 'INVALID', httpStatus: status, detail: '2xx이나 본문이 에러' };
      }
      return { name: api.name, envVar, verdict: 'VALID', httpStatus: status, detail: '인증 성공' };
    }
    return { name: api.name, envVar, verdict: 'ERROR', httpStatus: status, detail: `예상치 못한 ${status}` };
  } catch {
    return { name: api.name, envVar, verdict: 'ERROR', detail: '네트워크 실패' };
  }
}

async function main(): Promise<void> {
  const { data: apis, error } = await supabase
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
  const keyed = (apis ?? []).filter(
    (a) => (a.auth_config as AuthConfig | null)?.env_var && !(a.auth_config as AuthConfig)?.default_key,
  );

  const results: KeyResult[] = [];
  for (const api of keyed) {
    results.push(await verifyKey(api));
  }

  process.stderr.write('\n===== Platform key validity =====\n');
  for (const r of results) {
    process.stderr.write(
      `  [${r.verdict.padEnd(12)}] ${r.name}  (${r.envVar})  ${r.httpStatus ?? ''}  ${r.detail}\n`,
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
