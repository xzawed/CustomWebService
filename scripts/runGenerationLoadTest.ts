#!/usr/bin/env tsx
/**
 * 사이트 생성 파이프라인 부하/안정성 테스트 스크립트.
 *
 * 사용법:
 *   ADMIN_API_KEY=... TEST_USER_ID=... BASE_URL=https://xzawed.xyz \
 *     pnpm tsx scripts/runGenerationLoadTest.ts [--iterations=20] [--concurrency=4]
 *
 * 골든셋 API에서 3~5개를 무작위로 조합해 `POST /api/v1/admin/test-generation`을
 * 호출하고 성공·실패·평균 응답 시간·실패 사유를 집계합니다.
 *
 * 동작 모드:
 *   - 기본은 `cleanup: true` — 생성된 프로젝트는 즉시 삭제됩니다.
 *   - `--keep` 옵션을 주면 생성된 프로젝트를 남깁니다 (수동 검사용).
 */

const GOLDEN_SET = [
  { id: '6890346f-fa79-483c-bce2-f841ad3420fd', name: 'Random User' },
  { id: '04e79764-c27c-46d8-b63c-2794fbe5a3f7', name: 'JSONPlaceholder' },
  { id: '02cea7ab-d89a-4e51-b9c5-32ed0fd00338', name: 'PokéAPI' },
  { id: '9a04cd18-15bb-4424-a4f1-10ddf728749b', name: 'wheretheiss.at' },
  { id: 'de8f5375-22dc-4573-9a64-2903c150fece', name: 'Hacker News API' },
  { id: '8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7', name: 'Spaceflight News' },
  { id: 'f1b6d26f-4cb4-4ea7-844b-8c6ba3b29a8a', name: 'The Cat API' },
  { id: 'da2e14a4-e8c6-4164-835e-6ce8b212d59b', name: 'TheMealDB' },
  { id: '522f7158-7de0-4447-80bb-ea71a8e56b50', name: 'The Color API' },
  { id: '7b66ab19-4d00-4d39-a4f9-2c2b6c6367a4', name: 'NASA APOD' },
];

const CONTEXTS = [
  '연결된 API 데이터를 보기 좋게 카드 그리드로 나열하고 새로고침 버튼을 제공하는 한 페이지짜리 대시보드를 만들어주세요.',
  'API에서 받은 데이터를 검색·필터링할 수 있고 모바일에서도 잘 보이는 단일 페이지 서비스를 만들어주세요.',
  '랜덤하게 데이터를 가져와 큰 카드로 보여주고, 상세 정보 모달을 띄울 수 있는 인터랙티브 페이지를 만들어주세요.',
  '연결된 API의 데이터를 깔끔한 리스트와 통계 카드로 보여주는 대시보드를 만들어주세요. 다크 모드 지원.',
];

interface RunResult {
  index: number;
  apis: string[];
  success: boolean;
  durationMs: number;
  projectId?: string;
  errorMessage?: string;
  qcPassed?: boolean;
  qcScore?: number;
}

function parseArgs(): { iterations: number; concurrency: number; keep: boolean } {
  const args = process.argv.slice(2);
  const get = (k: string, def: number) => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    return a ? parseInt(a.split('=')[1], 10) : def;
  };
  return {
    iterations: get('iterations', 20),
    concurrency: get('concurrency', 4),
    keep: args.includes('--keep'),
  };
}

function pickRandomApis(): string[] {
  const count = 3 + Math.floor(Math.random() * 3); // 3..5
  const pool = [...GOLDEN_SET];
  const out: typeof GOLDEN_SET = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out.map((a) => a.id);
}

async function runOne(index: number, baseUrl: string, adminKey: string, userId: string, keep: boolean): Promise<RunResult> {
  const apis = pickRandomApis();
  const context = CONTEXTS[Math.floor(Math.random() * CONTEXTS.length)];
  const startedAt = Date.now();
  console.log(`[#${index}] start apis=${apis.length} ctx="${context.slice(0, 30)}…"`);

  try {
    const res = await fetch(`${baseUrl}/api/v1/admin/test-generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, apiIds: apis, context, cleanup: !keep }),
      signal: AbortSignal.timeout(330_000), // 5.5분 (Railway 한도 + 여유)
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: {
        projectId?: string;
        durationMs?: number;
        error?: { message?: string };
        complete?: { qcResult?: { passed?: boolean; score?: number } };
      };
      error?: { code?: string; message?: string };
    };
    const durationMs = Date.now() - startedAt;

    if (res.status !== 200 || body.success !== true) {
      return {
        index,
        apis,
        success: false,
        durationMs,
        projectId: body.data?.projectId,
        errorMessage: body.error?.message ?? body.data?.error?.message ?? `HTTP ${res.status}`,
      };
    }

    return {
      index,
      apis,
      success: true,
      durationMs,
      projectId: body.data?.projectId,
      qcPassed: body.data?.complete?.qcResult?.passed,
      qcScore: body.data?.complete?.qcResult?.score,
    };
  } catch (err) {
    return {
      index,
      apis,
      success: false,
      durationMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

async function withConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const { iterations, concurrency, keep } = parseArgs();
  const baseUrl = process.env.BASE_URL ?? 'https://xzawed.xyz';
  const adminKey = process.env.ADMIN_API_KEY;
  const userId = process.env.TEST_USER_ID;

  if (!adminKey) {
    console.error('ADMIN_API_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }
  if (!userId) {
    console.error('TEST_USER_ID 환경변수가 필요합니다.');
    process.exit(1);
  }

  console.log(`== Generation Load Test ==`);
  console.log(`Base URL    : ${baseUrl}`);
  console.log(`Iterations  : ${iterations}`);
  console.log(`Concurrency : ${concurrency}`);
  console.log(`Cleanup     : ${keep ? 'NO (projects retained)' : 'YES (auto-delete)'}\n`);

  const indices = Array.from({ length: iterations }, (_, i) => i + 1);
  const t0 = Date.now();
  const results = await withConcurrency(indices, concurrency, (i) => runOne(i, baseUrl, adminKey, userId, keep));
  const totalMs = Date.now() - t0;

  const passed = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;
  const successRate = (passed.length / results.length) * 100;

  console.log('\n== 결과 ==');
  console.log(`전체 ${results.length}회 / 성공 ${passed.length}회 / 실패 ${failed.length}회`);
  console.log(`성공률      : ${successRate.toFixed(1)}%`);
  console.log(`평균 응답   : ${(avgMs / 1000).toFixed(1)}초`);
  console.log(`총 실행 시간: ${(totalMs / 1000).toFixed(1)}초`);
  const qcSamples = passed.filter((r) => typeof r.qcScore === 'number');
  if (qcSamples.length > 0) {
    const avgQc = qcSamples.reduce((s, r) => s + (r.qcScore ?? 0), 0) / qcSamples.length;
    const qcPassRate = (qcSamples.filter((r) => r.qcPassed).length / qcSamples.length) * 100;
    console.log(`평균 QC     : ${avgQc.toFixed(1)} (Fast QC 통과 ${qcPassRate.toFixed(1)}%)`);
  }

  if (failed.length > 0) {
    console.log('\n== 실패 사례 ==');
    for (const r of failed) {
      console.log(`#${r.index} (${(r.durationMs / 1000).toFixed(1)}s) — ${r.errorMessage ?? '(no message)'}`);
    }
    const errorCounts = new Map<string, number>();
    for (const r of failed) {
      const key = (r.errorMessage ?? 'unknown').slice(0, 80);
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    console.log('\n에러 유형 빈도:');
    for (const [msg, count] of [...errorCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count}회: ${msg}`);
    }
  }

  console.log('\n== Raw JSON ==');
  console.log(JSON.stringify({ iterations, concurrency, successRate, results }, null, 2));

  process.exit(failed.length > 0 ? 2 : 0);
}

void main();
