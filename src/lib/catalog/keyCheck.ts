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
