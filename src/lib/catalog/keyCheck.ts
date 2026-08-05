/**
 * 플랫폼 키 유효성 검증 핵심 로직 (스크립트 + 관리자 진단 엔드포인트 공용).
 *
 * 프록시(resolveApiKey)와 동일하게 키를 주입해 실제 인증 요청을 보내고 유효성을 판정한다.
 * 단, 카탈로그 auth_config에 prefix/header_prefix("KakaoAK "/"Client-ID ")가 선언돼 있고
 * raw 주입이 401이면 prefix를 적용해 재시도한다 — 이때 성공하면 "프록시가 prefix를 적용해야 함"
 * (needsPrefixFix)을 보고한다. 키 값은 호출 측에서 절대 노출하지 않는다.
 *
 * I/O(fetch)는 주입형(KeyFetch)이라 단위 테스트 가능.
 */

import { buildTestUrl, looksLikeErrorBody, type TestableEndpoint } from './healthCheck';

export type KeyVerdict = 'VALID' | 'INVALID' | 'MISSING' | 'RATE_LIMITED' | 'ERROR' | 'NO_ENDPOINT';

export interface KeyAuthConfig {
  param_name?: string;
  param_in?: string;
  env_var?: string;
  default_key?: string;
  prefix?: string;
  header_prefix?: string;
}

export interface KeyCheckApi {
  name: string;
  baseUrl: string;
  authConfig: KeyAuthConfig | null;
  endpoints: Array<TestableEndpoint & { method?: string }> | null;
}

export interface KeyCheckResult {
  name: string;
  envVar: string;
  verdict: KeyVerdict;
  httpStatus?: number;
  detail: string;
  needsPrefixFix?: boolean;
}

export type KeyFetch = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ status: number; bodyText: string; networkError: boolean }>;

export function resolvePrefix(cfg: KeyAuthConfig | null): string {
  if (!cfg) return '';
  return cfg.prefix ?? cfg.header_prefix ?? '';
}

export function classifyKeyResponse(
  httpStatus: number,
  bodyText: string,
  networkError: boolean,
): { verdict: KeyVerdict; detail: string } {
  if (networkError) return { verdict: 'ERROR', detail: '네트워크 실패' };
  if (httpStatus === 401 || httpStatus === 403) return { verdict: 'INVALID', detail: `키 거부(${httpStatus})` };
  if (httpStatus === 429) return { verdict: 'RATE_LIMITED', detail: '429 — 키 통과, 한도 초과' };
  if (httpStatus >= 200 && httpStatus < 400) {
    return looksLikeErrorBody(bodyText)
      ? { verdict: 'INVALID', detail: '2xx이나 본문이 에러' }
      : { verdict: 'VALID', detail: '인증 성공' };
  }
  return { verdict: 'ERROR', detail: `예상치 못한 ${httpStatus}` };
}

export async function verifyApiKey(
  api: KeyCheckApi,
  key: string | undefined,
  doFetch: KeyFetch,
): Promise<KeyCheckResult> {
  const cfg = api.authConfig ?? {};
  const envVar = cfg.env_var ?? '(none)';
  if (!cfg.env_var) return { name: api.name, envVar, verdict: 'ERROR', detail: 'env_var 미정의' };
  if (!key) return { name: api.name, envVar, verdict: 'MISSING', detail: '환경변수 미설정' };

  const getEp = (api.endpoints ?? []).find((e) => (e.method ?? 'GET') === 'GET');
  if (!getEp) return { name: api.name, envVar, verdict: 'NO_ENDPOINT', detail: 'GET 엔드포인트 없음' };

  const baseTestUrl = buildTestUrl(api.baseUrl, getEp);
  const prefix = resolvePrefix(cfg);

  async function attempt(injectedValue: string): Promise<{ status: number; verdict: KeyVerdict; detail: string }> {
    const u = new URL(baseTestUrl);
    const headers: Record<string, string> = {
      'User-Agent': 'CustomWebService-KeyVerify/1.0',
      Accept: 'application/json',
    };
    if (cfg.param_name) {
      if (cfg.param_in === 'header') headers[cfg.param_name] = injectedValue;
      else u.searchParams.set(cfg.param_name, injectedValue);
    }
    const res = await doFetch(u.toString(), headers);
    const c = classifyKeyResponse(res.status, res.bodyText, res.networkError);
    return { status: res.status, ...c };
  }

  // 1) 프록시 현재 동작과 동일하게 raw 값으로 시도
  const raw = await attempt(key);
  if (raw.verdict !== 'INVALID') {
    return { name: api.name, envVar, verdict: raw.verdict, httpStatus: raw.status, detail: raw.detail };
  }

  // 2) raw가 INVALID이고 header prefix가 선언돼 있으면 prefix+key로 재시도
  //    (키 값에 prefix가 없을 가능성 → 성공 시 프록시가 prefix를 적용해야 함)
  if (prefix && cfg.param_in === 'header') {
    const withPrefix = await attempt(`${prefix}${key}`);
    if (withPrefix.verdict === 'VALID' || withPrefix.verdict === 'RATE_LIMITED') {
      return {
        name: api.name,
        envVar,
        verdict: withPrefix.verdict,
        httpStatus: withPrefix.status,
        detail: `raw 주입 실패, prefix("${prefix.trim()}") 적용 시 성공 → 프록시가 prefix 미적용 (수정 필요)`,
        needsPrefixFix: true,
      };
    }
  }

  return { name: api.name, envVar, verdict: 'INVALID', httpStatus: raw.status, detail: raw.detail };
}

/** 활성화 게이트 한 번의 시도 결과 (오퍼레이터가 부분 실패 원인을 볼 수 있게). */
export interface ConsistencyAttempt {
  verdict: KeyVerdict;
  httpStatus?: number;
  detail: string;
}

/**
 * 활성화 전용 연속 검증 결과.
 * `KeyCheckResult`와 호환 필드를 유지하고, samples/successes/attempts·시도별 판정을 붙인다.
 */
export interface ConsistencyResult extends KeyCheckResult {
  /** 요청한 연속 성공 횟수 (기본 3) */
  samples: number;
  /** VALID 로 끝난 시도 수 */
  successes: number;
  /** 실제로 돌린 시도 수 (조기 종료 시 samples 미만). MISSING/NO_ENDPOINT 는 0 */
  attempts: number;
  /** 시도별 판정 (네트워크 프로브가 나간 것만) */
  attemptResults: ConsistencyAttempt[];
}

export interface ConsistencyOptions {
  samples?: number;
  gapMs?: number;
  /** 테스트 결정성용. 기본은 setTimeout 기반 sleep */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 활성화 게이트 — N회 연속 VALID 일 때만 통과.
 *
 * `verifyApiKey` 를 시도마다 재사용한다(로직 복제 금지).
 *
 * **첫 non-VALID 에서 즉시 중단**한다. 이유: 정상 API는 빠르게 응답하고,
 * 실패·타임아웃 API는 1회에서 끝난다. 조기 종료 없이 전부 돌리면
 * 최악 `후보 수 × samples × 15s` 로 관리자 요청이 수분 단위가 된다.
 *
 * 판정:
 * - 전부 VALID → activatable
 * - INVALID → 키 거부 (그대로 INVALID)
 * - RATE_LIMITED → 보류(키가 틀린 게 아님). INVALID 로 덮어쓰지 않음
 * - ERROR(5xx/타임아웃 등) → 활성화 거부 — 에어코리아 간헐 504 가 이 경로
 * - MISSING / NO_ENDPOINT → 재시도·sleep 없이 즉시 반환 (attempts=0)
 */
export async function verifyApiKeyForActivation(
  api: KeyCheckApi,
  key: string | undefined,
  doFetch: KeyFetch,
  options: ConsistencyOptions = {},
): Promise<ConsistencyResult> {
  // samples는 최소 1로 죈다. 0·음수를 그대로 두면 루프가 한 번도 돌지 않아
  // "전부 VALID" 분기로 떨어지고, 프로브를 한 번도 안 한 API가 활성화된다.
  // (게이트를 통째로 무력화하는 값이므로 조용히 통과시키지 않고 1로 올린다.)
  const samples = Math.max(1, Math.trunc(options.samples ?? 3));
  const gapMs = Math.max(0, options.gapMs ?? 2000);
  const sleep = options.sleep ?? defaultSleep;

  const cfg = api.authConfig ?? {};
  const envVar = cfg.env_var ?? '(none)';
  const emptyAttempts: ConsistencyAttempt[] = [];

  if (!cfg.env_var) {
    return {
      name: api.name,
      envVar,
      verdict: 'ERROR',
      detail: 'env_var 미정의',
      samples,
      successes: 0,
      attempts: 0,
      attemptResults: emptyAttempts,
    };
  }
  if (!key) {
    return {
      name: api.name,
      envVar,
      verdict: 'MISSING',
      detail: '환경변수 미설정',
      samples,
      successes: 0,
      attempts: 0,
      attemptResults: emptyAttempts,
    };
  }

  const getEp = (api.endpoints ?? []).find((e) => (e.method ?? 'GET') === 'GET');
  if (!getEp) {
    return {
      name: api.name,
      envVar,
      verdict: 'NO_ENDPOINT',
      detail: 'GET 엔드포인트 없음',
      samples,
      successes: 0,
      attempts: 0,
      attemptResults: emptyAttempts,
    };
  }

  const attemptResults: ConsistencyAttempt[] = [];
  let successes = 0;
  let last: KeyCheckResult | null = null;

  for (let i = 0; i < samples; i += 1) {
    if (i > 0) {
      await sleep(gapMs);
    }

    const r = await verifyApiKey(api, key, doFetch);
    last = r;
    attemptResults.push({
      verdict: r.verdict,
      httpStatus: r.httpStatus,
      detail: r.detail,
    });

    if (r.verdict === 'VALID') {
      successes += 1;
      continue;
    }

    // 첫 non-VALID — 남은 샘플은 돌리지 않는다 (INVALID / RATE_LIMITED / ERROR 모두)
    return {
      name: r.name,
      envVar: r.envVar,
      verdict: r.verdict,
      httpStatus: r.httpStatus,
      detail: r.detail,
      needsPrefixFix: r.needsPrefixFix,
      samples,
      successes,
      attempts: attemptResults.length,
      attemptResults,
    };
  }

  // 전부 VALID
  return {
    name: last!.name,
    envVar: last!.envVar,
    verdict: 'VALID',
    httpStatus: last!.httpStatus,
    detail: `연속 ${samples}회 인증 성공`,
    needsPrefixFix: last!.needsPrefixFix,
    samples,
    successes,
    attempts: attemptResults.length,
    attemptResults,
  };
}
