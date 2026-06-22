// scripts/verifyCatalog.ts
// Run: pnpm tsx scripts/verifyCatalog.ts [--write]
//
// ACTIVE api_catalog 항목을 Supabase에서 읽어 각 엔드포인트의 업스트림을
// DIRECT(프록시 경유 X)로 라이브 호출하고 working/degraded/broken/key_gated/unknown
// 으로 분류한다. 분류 로직은 src/lib/catalog/healthCheck.ts(단위 테스트 대상)에 위임.
//
// - .env.local이 있으면 자동 로드, 없으면 process.env 사용(CI: GitHub secrets)
// - 읽기는 anon 키로 충분(RLS "Anyone can view active APIs")
// - --write 시 verification_status/verified_at/last_verification_note를 DB에 반영
//   (service role 필요; working/degraded→verified, broken→broken, 그 외 미변경)
// - BROKEN이 1개라도 있으면 exit code 1 (CI 게이트)

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildTestUrl,
  classifyResponse,
  summarizeApi,
  toVerificationStatus,
  type HealthStatus,
  type TestableEndpoint,
} from '../src/lib/catalog/healthCheck';

// Auto-load .env.local (handles UTF-8 BOM and CRLF line endings)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs
    .readFileSync(envPath, 'utf-8')
    .replace(/^﻿/, '')
    .replace(/\r/g, '')
    .split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_KEY = SERVICE_KEY || ANON_KEY;
let WRITE = process.argv.includes('--write');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key (SERVICE_ROLE / ANON).');
  process.exit(1);
}
// --write는 service role 키가 있어야 동작(RLS write는 service-role 전용).
// 키가 없으면 크래시 대신 read-only로 graceful degrade한다 — CI(cron)가 secret 미설정
// 상태에서도 분류·게이트는 그대로 수행하고, broken/verified DB 반영만 건너뛴다.
if (WRITE && !SERVICE_KEY) {
  console.error(
    '⚠️ --write requested but SUPABASE_SERVICE_ROLE_KEY is not set — running read-only (no DB write). ' +
      'Set SUPABASE_SERVICE_ROLE_KEY to persist verification_status.',
  );
  WRITE = false;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const REQUEST_TIMEOUT_MS = 20_000;
const DELAY_BETWEEN_MS = 300;
const TEXT_CONTENT_RE = /json|text|xml|javascript|x-www-form-urlencoded/i;

interface AuthConfig {
  param_name?: string;
  param_in?: string;
  default_key?: string;
}

interface EndpointResult {
  path: string;
  method: string;
  status: HealthStatus | 'skipped';
  httpStatus?: number;
  elapsedMs?: number;
  reason?: string;
}

interface ApiResult {
  id: string;
  name: string;
  category: string;
  baseUrl: string;
  authType: string;
  overallStatus: HealthStatus;
  endpoints: EndpointResult[];
}

async function testEndpoint(
  api: { auth_type: string; base_url: string; auth_config: AuthConfig | null },
  endpoint: TestableEndpoint & { method?: string },
): Promise<EndpointResult> {
  const method = endpoint.method ?? 'GET';
  if (method !== 'GET') {
    return { path: endpoint.path, method, status: 'skipped' };
  }

  const url = new URL(buildTestUrl(api.base_url, endpoint));
  const cfg = api.auth_config ?? {};
  const headers: Record<string, string> = {
    'User-Agent': 'CustomWebService-HealthCheck/1.0',
    Accept: 'application/json',
  };

  // 공개 default_key(예: NASA DEMO_KEY)는 주입해 정상 동작을 확인한다.
  // 플랫폼 비밀 키는 주입하지 않음 → 401 = key_gated 로 분류.
  if (api.auth_type === 'api_key' && cfg.default_key && cfg.param_name) {
    if (cfg.param_in === 'header') headers[cfg.param_name] = cfg.default_key;
    else url.searchParams.set(cfg.param_name, cfg.default_key);
  }

  // 일시적 실패(5xx/429/네트워크)는 1회 재시도해 플래키 오탐을 줄인다 (예: NASA APOD 503).
  const MAX_ATTEMPTS = 2;
  let httpStatus = 0;
  let contentType = '';
  let bodyText = '';
  let networkError = false;
  let elapsedMs = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    httpStatus = 0;
    contentType = '';
    bodyText = '';
    networkError = false;
    const start = Date.now();
    try {
      const res = await fetch(url.toString(), {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      httpStatus = res.status;
      contentType = res.headers.get('content-type') ?? '';
      if (TEXT_CONTENT_RE.test(contentType)) {
        bodyText = (await res.text()).slice(0, 20_000);
      } else {
        // 바이너리(이미지 등)는 본문을 보관하지 않되 소켓은 비운다.
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
      }
    } catch {
      networkError = true;
    }
    elapsedMs = Date.now() - start;

    const transient = networkError || httpStatus >= 500 || httpStatus === 429;
    if (!transient || attempt === MAX_ATTEMPTS) break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  const { status, reason } = classifyResponse({
    authType: api.auth_type as 'none' | 'api_key' | 'oauth',
    httpStatus,
    contentType,
    bodyText,
    elapsedMs,
    networkError,
  });

  return { path: endpoint.path, method, status, httpStatus, elapsedMs, reason };
}

async function main(): Promise<void> {
  const { data: apis, error } = await supabase
    .from('api_catalog')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch catalog:', error.message);
    process.exit(1);
  }

  const results: ApiResult[] = [];

  for (const api of apis ?? []) {
    const eps = (api.endpoints as Array<TestableEndpoint & { method?: string }>) ?? [];
    const endpoints: EndpointResult[] = [];

    for (const ep of eps) {
      process.stderr.write(`Testing ${api.name} ${ep.method ?? 'GET'} ${ep.path} ...\n`);
      endpoints.push(await testEndpoint(api, ep));
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MS));
    }

    const statuses = endpoints
      .map((e) => e.status)
      .filter((s): s is HealthStatus => s !== 'skipped');
    const overallStatus = summarizeApi(statuses);

    results.push({
      id: api.id,
      name: api.name,
      category: api.category,
      baseUrl: api.base_url,
      authType: api.auth_type,
      overallStatus,
      endpoints,
    });
  }

  // --write: DB 반영 (working/degraded→verified, broken→broken, 그 외 skip)
  let written = 0;
  if (WRITE) {
    for (const r of results) {
      const vs = toVerificationStatus(r.overallStatus);
      if (!vs) continue;
      const note = `${new Date().toISOString().slice(0, 10)} 자동 헬스체크: ${r.overallStatus}`;
      const { error: upErr } = await supabase
        .from('api_catalog')
        .update({
          verification_status: vs,
          verified_at: vs === 'verified' ? new Date().toISOString() : undefined,
          last_verification_note: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id);
      if (!upErr) written += 1;
    }
  }

  const counts = (s: HealthStatus): number => results.filter((r) => r.overallStatus === s).length;
  const report = {
    generatedAt: new Date().toISOString(),
    totalApis: results.length,
    working: counts('working'),
    degraded: counts('degraded'),
    broken: counts('broken'),
    keyGated: counts('key_gated'),
    unknown: counts('unknown'),
    written: WRITE ? written : undefined,
    apis: results,
  };

  fs.writeFileSync('verification-report.json', JSON.stringify(report, null, 2));

  // 사람이 읽는 요약 (stderr)
  const ICON: Record<HealthStatus, string> = {
    working: 'OK ',
    degraded: 'DEG',
    broken: 'BRK',
    key_gated: 'KEY',
    unknown: '???',
  };
  process.stderr.write('\n===== Catalog health summary =====\n');
  for (const r of results) {
    process.stderr.write(`  [${ICON[r.overallStatus]}] ${r.name} (${r.category})\n`);
  }
  process.stderr.write(
    `\nTotal ${report.totalApis} | working ${report.working} | degraded ${report.degraded} | ` +
      `broken ${report.broken} | key_gated ${report.keyGated} | unknown ${report.unknown}` +
      (WRITE ? ` | written ${written}` : '') +
      '\n',
  );

  // 머신용 JSON은 stdout
  console.log(JSON.stringify(report, null, 2));

  if (report.broken > 0) {
    process.stderr.write(`\n❌ ${report.broken} API(s) BROKEN — failing.\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
