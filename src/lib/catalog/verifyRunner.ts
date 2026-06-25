/**
 * 카탈로그 라이브 검증 오케스트레이터 (관리자 트리거 엔드포인트 공용 핵심 로직).
 *
 * 활성 카탈로그 각 API의 GET 엔드포인트를 실제 호출해 `healthCheck.classifyResponse`로 분류하고,
 * `summarizeApi`로 API 단위 상태를 집계한 뒤 `toVerificationStatus`로 매핑한다.
 * 자동 판정 가능한 경우(working/degraded→verified, broken→broken)만, 그리고 현재 값과 다를 때만 DB를 갱신한다.
 * key_gated/unknown(매핑 null)은 기존 값을 보존한다(일시 장애·키 부재로 인한 오판 방지).
 *
 * I/O(fetch·DB)는 주입형이라 단위 테스트 가능 — 라우트가 실제 fetch/repo를 주입한다.
 */

import {
  buildTestUrl,
  classifyResponse,
  summarizeApi,
  toVerificationStatus,
  type HealthStatus,
  type TestableEndpoint,
} from './healthCheck';
import type { ApiAuthType, ApiVerificationStatus } from '@/types/api';

export interface VerifyApi {
  id: string;
  name: string;
  baseUrl: string;
  authType: ApiAuthType;
  endpoints: Array<TestableEndpoint & { method?: string }> | null;
  verificationStatus: ApiVerificationStatus;
}

export type HealthFetch = (url: string) => Promise<{
  status: number; // 0 = 네트워크 실패
  bodyText: string;
  contentType: string;
  elapsedMs: number;
  networkError: boolean;
}>;

export type UpdateVerification = (id: string, status: ApiVerificationStatus) => Promise<void>;

export interface VerifyApiResult {
  id: string;
  name: string;
  previous: ApiVerificationStatus;
  health: HealthStatus;
  next: ApiVerificationStatus | null; // null = 자동 판정 불가 → 보존
  updated: boolean;
}

export interface VerifyRunnerResult {
  checked: number;
  updated: number;
  unchanged: number; // 판정 가능하나 현재 값과 동일
  skipped: number; // 자동 판정 불가(next=null)
  results: VerifyApiResult[];
}

/** 단일 API의 GET 엔드포인트들을 검사해 health 상태와 매핑된 verification_status를 반환한다. */
export async function verifyOneApi(
  api: VerifyApi,
  doFetch: HealthFetch
): Promise<{ health: HealthStatus; next: ApiVerificationStatus | null }> {
  const getEndpoints = (api.endpoints ?? []).filter((e) => (e.method ?? 'GET').toUpperCase() === 'GET');
  if (getEndpoints.length === 0) {
    return { health: 'unknown', next: null };
  }

  const statuses: HealthStatus[] = [];
  for (const ep of getEndpoints) {
    const url = buildTestUrl(api.baseUrl, ep);
    const r = await doFetch(url);
    const { status } = classifyResponse({
      authType: api.authType,
      httpStatus: r.status,
      contentType: r.contentType,
      bodyText: r.bodyText,
      elapsedMs: r.elapsedMs,
      networkError: r.networkError,
    });
    statuses.push(status);
  }

  const health = summarizeApi(statuses);
  return { health, next: toVerificationStatus(health) };
}

/** 순서를 보존하며 동시성 제한 하에 매핑한다. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i], i);
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

export interface RunOptions {
  concurrency?: number;
}

/** 활성 API 목록을 검증하고, 자동 판정 가능 + 변경된 항목만 DB를 갱신한다. */
export async function runCatalogVerification(
  apis: VerifyApi[],
  doFetch: HealthFetch,
  doUpdate: UpdateVerification,
  options: RunOptions = {}
): Promise<VerifyRunnerResult> {
  const concurrency = options.concurrency ?? 6;

  const results = await mapWithConcurrency(apis, concurrency, async (api) => {
    const { health, next } = await verifyOneApi(api, doFetch);
    let updated = false;
    if (next !== null && next !== api.verificationStatus) {
      await doUpdate(api.id, next);
      updated = true;
    }
    const result: VerifyApiResult = {
      id: api.id,
      name: api.name,
      previous: api.verificationStatus,
      health,
      next,
      updated,
    };
    return result;
  });

  return {
    checked: results.length,
    updated: results.filter((r) => r.updated).length,
    unchanged: results.filter((r) => !r.updated && r.next !== null).length,
    skipped: results.filter((r) => r.next === null).length,
    results,
  };
}
