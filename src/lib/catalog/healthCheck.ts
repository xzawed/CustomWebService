/**
 * 카탈로그 API 헬스체크 분류 로직 (순수 함수 — 단위 테스트 대상).
 *
 * 업스트림 응답을 working / degraded / broken / key_gated / unknown 으로 분류한다.
 * - working      : 2xx + 유효 응답
 * - degraded     : 동작하나 느림(>5s) 또는 429(rate limited)
 * - broken       : 네트워크 실패, 5xx, 키리스 API의 예기치 못한 401, 또는
 *                  "2xx지만 본문이 에러/deprecation"인 경우 (HTTP 200이 실패를 가리는 케이스)
 * - key_gated    : 키 필요(api_key/oauth) API가 401/403 — 호스트는 살아있고 키만 없음
 * - unknown      : 그 외 4xx (테스트 파라미터 불일치 가능성 — broken으로 단정하지 않음)
 *
 * I/O(fetch·DB)는 호출 측(scripts/verifyCatalog.ts)에서 처리한다.
 */

import type { ApiAuthType, ApiVerificationStatus } from '@/types/api';

export type HealthStatus = 'working' | 'degraded' | 'broken' | 'key_gated' | 'unknown';

export const SLOW_THRESHOLD_MS = 5000;

export interface ClassifyInput {
  authType: ApiAuthType;
  httpStatus: number; // 0 이면 네트워크 실패
  contentType: string;
  bodyText: string; // 이미지 등 바이너리는 빈 문자열 전달
  elapsedMs: number;
  networkError?: boolean;
}

export interface ClassifyResult {
  status: HealthStatus;
  reason: string;
}

function looksLikeJson(bodyText: string): boolean {
  const t = bodyText.trim();
  return t.startsWith('{') || t.startsWith('[');
}

/**
 * data.go.kr 공공데이터 포털 성공/허용 코드.
 * - 00 / 000 / 0000 / INFO-000: 정상
 * - 03: NO_DATA — 인증은 성공, 조회 결과만 없음 (키 INVALID로 오판하지 않음)
 * - 22: LIMIT_EXCEEDED — HTTP 429가 별도 RATE_LIMITED로 매핑되므로 본문만으로는 에러 아님
 */
const DATA_GO_KR_ALLOWLIST = new Set(['00', '000', '0000', 'INFO-000', '03', '22']);

function isDataGoKrAllowlisted(code: string): boolean {
  return DATA_GO_KR_ALLOWLIST.has(code.trim());
}

/**
 * XML 태그 본문 추출 (정규식 미사용 — ReDoS 회피).
 * 단순 `<tag>…</tag>` 형태만 지원 (속성·네임스페이스 접두사 없음 전제).
 */
function extractTagContent(xml: string, tagName: string): string | null {
  const open = `<${tagName}>`;
  const close = `</${tagName}>`;
  const start = xml.indexOf(open);
  if (start === -1) return null;
  const contentStart = start + open.length;
  const end = xml.indexOf(close, contentStart);
  if (end === -1) return null;
  return xml.slice(contentStart, end).trim();
}

/**
 * header 객체가 data.go.kr resultCode 엔벨로프인지 판정.
 * @param requireResultMsg true면 resultMsg도 필수 (최상위 bare header 오탐 방지)
 * @returns true=에러, false=허용, null=필드 부족으로 불일치
 */
function classifyHeaderResultCode(
  header: Record<string, unknown>,
  requireResultMsg: boolean,
): boolean | null {
  const resultCode = header.resultCode;
  if (typeof resultCode !== 'string' && typeof resultCode !== 'number') return null;
  if (requireResultMsg) {
    const resultMsg = header.resultMsg;
    if (typeof resultMsg !== 'string' || resultMsg.trim() === '') return null;
  }
  return !isDataGoKrAllowlisted(String(resultCode));
}

/**
 * data.go.kr 에러 엔벨로프 판정.
 * @returns true=에러, false=허용(성공/NO_DATA/LIMIT), null=엔벨로프 불일치(REST 휴리스틱으로 폴스루)
 *
 * Shape A:  response.header.resultCode (JSON) / <response><header><resultCode> (XML)
 * Shape A′: 최상위 header.resultCode + resultMsg (JSON) / 최상위 <header>… (XML)
 *           — 기상청·에어코리아 에러가 response 래퍼 없이 header만 돌린다 (2026-08-05 실측)
 * Shape B:  OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode|errMsg (JSON/XML)
 *
 * 순서: A(래핑) → A′(비래핑) → B. 둘 다 있으면 래핑이 우선.
 * bare top-level resultCode(header 없음)는 인식하지 않는다.
 */
function classifyDataGoKrEnvelope(bodyText: string): boolean | null {
  // ── JSON 경로 ──────────────────────────────────────────────────────────────
  if (looksLikeJson(bodyText)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = null;
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;

      // Shape A: response.header.resultCode (resultMsg 불필요 — 중첩이 이미 식별력 있음)
      const response = obj.response;
      if (response !== null && typeof response === 'object' && !Array.isArray(response)) {
        const header = (response as Record<string, unknown>).header;
        if (header !== null && typeof header === 'object' && !Array.isArray(header)) {
          const verdict = classifyHeaderResultCode(header as Record<string, unknown>, false);
          if (verdict !== null) return verdict;
        }
      }

      // Shape A′: 최상위 header.resultCode + resultMsg (둘 다 필수 — 오탐 가드)
      const topHeader = obj.header;
      if (topHeader !== null && typeof topHeader === 'object' && !Array.isArray(topHeader)) {
        const verdict = classifyHeaderResultCode(topHeader as Record<string, unknown>, true);
        if (verdict !== null) return verdict;
      }

      // Shape B: OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode / errMsg
      const svc = obj.OpenAPI_ServiceResponse;
      if (svc !== null && typeof svc === 'object' && !Array.isArray(svc)) {
        const cmm = (svc as Record<string, unknown>).cmmMsgHeader;
        if (cmm !== null && typeof cmm === 'object' && !Array.isArray(cmm)) {
          const cmmObj = cmm as Record<string, unknown>;
          const reason = cmmObj.returnReasonCode;
          if (typeof reason === 'string' || typeof reason === 'number') {
            return !isDataGoKrAllowlisted(String(reason));
          }
          // 코드 없이 errMsg만 있으면 인식된 엔벨로프 → fail-closed
          if (typeof cmmObj.errMsg === 'string' && cmmObj.errMsg.trim() !== '') {
            return true;
          }
          // 엔벨로프 마커는 있으나 판정 필드 없음 → fail-closed
          return true;
        }
      }
    }
  }

  // ── XML 경로 (비-JSON early return 이전에 수행) ─────────────────────────────
  // Shape A: <response>…<header>…<resultCode>…</resultCode>
  const responseXml = extractTagContent(bodyText, 'response');
  if (responseXml !== null) {
    const headerXml = extractTagContent(responseXml, 'header');
    if (headerXml !== null) {
      const resultCode = extractTagContent(headerXml, 'resultCode');
      if (resultCode !== null) {
        return !isDataGoKrAllowlisted(resultCode);
      }
    }
  }

  // Shape A′: 최상위 <header>… (response 래퍼 없음). resultCode + resultMsg 둘 다 필수.
  // response 래퍼가 이미 resultCode로 판정됐으면 위에서 반환했으므로 여기까지 오지 않는다.
  // response 없이 header만 있거나, response에 resultCode가 없을 때만 도달.
  if (responseXml === null) {
    const topHeaderXml = extractTagContent(bodyText, 'header');
    if (topHeaderXml !== null) {
      const resultCode = extractTagContent(topHeaderXml, 'resultCode');
      const resultMsg = extractTagContent(topHeaderXml, 'resultMsg');
      if (resultCode !== null && resultMsg !== null && resultMsg !== '') {
        return !isDataGoKrAllowlisted(resultCode);
      }
    }
  }

  // Shape B: <OpenAPI_ServiceResponse>…<cmmMsgHeader>…
  const svcXml = extractTagContent(bodyText, 'OpenAPI_ServiceResponse');
  if (svcXml !== null) {
    const cmmXml = extractTagContent(svcXml, 'cmmMsgHeader');
    if (cmmXml !== null) {
      const reason = extractTagContent(cmmXml, 'returnReasonCode');
      if (reason !== null) {
        return !isDataGoKrAllowlisted(reason);
      }
      const errMsg = extractTagContent(cmmXml, 'errMsg');
      if (errMsg !== null && errMsg !== '') {
        return true;
      }
      return true;
    }
  }

  return null;
}

/** 2xx 본문이 사실상 에러/폐기 응답인지 판정 (HTTP 200이 실패를 가리는 케이스 탐지). */
export function looksLikeErrorBody(bodyText: string): boolean {
  // 1) 구조와 무관한 deprecation 텍스트 신호
  if (/has been deprecated|api version has been deprecated/i.test(bodyText)) return true;

  // 2) data.go.kr 엔벨로프 (JSON 또는 XML) — 비-JSON early return 이전
  const envelope = classifyDataGoKrEnvelope(bodyText);
  if (envelope !== null) return envelope;

  // 3) 비-JSON: deprecation·엔벨로프 외 신호 없음
  if (!looksLikeJson(bodyText)) return false;

  // 4) 기존 REST JSON 휴리스틱
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return false;
  }
  if (Array.isArray(parsed) || parsed === null || typeof parsed !== 'object') return false;

  const obj = parsed as Record<string, unknown>;
  if (obj.success === false) return true;
  if (obj.error === true) return true;
  if (typeof obj.error === 'string' && obj.error.trim() !== '') return true;
  if (Array.isArray(obj.errors) && obj.errors.length > 0) return true;
  if (typeof obj.status === 'string' && obj.status.toLowerCase() === 'error') return true;
  return false;
}

export function classifyResponse(input: ClassifyInput): ClassifyResult {
  const { authType, httpStatus, bodyText, elapsedMs, networkError } = input;

  if (networkError || httpStatus === 0) {
    return { status: 'broken', reason: '네트워크 실패 / 호스트 도달 불가' };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return authType === 'none'
      ? { status: 'broken', reason: `키리스 API가 인증 거부(${httpStatus})` }
      : { status: 'key_gated', reason: `인증 필요(${httpStatus}) — 호스트 정상, 플랫폼 키 의존` };
  }

  if (httpStatus === 429) {
    return { status: 'degraded', reason: 'rate limited(429) — 호스트 정상' };
  }

  if (httpStatus >= 500) {
    return { status: 'broken', reason: `업스트림 5xx(${httpStatus})` };
  }

  const isSuccess = httpStatus >= 200 && httpStatus < 400;
  if (!isSuccess) {
    // 400/404/405 등 — 테스트 파라미터 불일치 가능성이 있어 broken으로 단정하지 않는다.
    return { status: 'unknown', reason: `예상치 못한 4xx(${httpStatus})` };
  }

  // 2xx/3xx 성공 경로 — content-type 무관하게 본문 에러/deprecation/공공데이터 엔벨로프 확인
  // (looksLikeErrorBody: deprecation → data.go.kr JSON/XML 엔벨로프 → 비-JSON false → REST JSON 휴리스틱)
  if (looksLikeErrorBody(bodyText)) {
    return { status: 'broken', reason: `HTTP ${httpStatus}이나 본문이 에러/deprecation` };
  }

  if (elapsedMs > SLOW_THRESHOLD_MS) {
    return { status: 'degraded', reason: `느린 응답(${elapsedMs}ms)` };
  }

  return { status: 'working', reason: `HTTP ${httpStatus}` };
}

const RANK: Record<HealthStatus, number> = {
  broken: 5,
  degraded: 4,
  working: 3,
  key_gated: 2,
  unknown: 1,
};

/** 엔드포인트별 상태를 API 단위 상태로 집계 (최악-우선, 단 working이 key_gated/unknown을 이김). */
export function summarizeApi(statuses: HealthStatus[]): HealthStatus {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), statuses[0]);
}

/** 헬스 상태 → DB verification_status 매핑. null이면 DB를 변경하지 않는다. */
export function toVerificationStatus(status: HealthStatus): ApiVerificationStatus | null {
  if (status === 'working' || status === 'degraded') return 'verified';
  if (status === 'broken') return 'broken';
  return null; // key_gated / unknown — 자동 판정 불가, 기존 값 보존
}

// knownSample은 key.toLowerCase()로 조회한다 — 키는 소문자로 등록.
// 도메인 전용 좌표·관측소 파라미터(nx/ny/base_date 등)는 넣지 않는다.
// 다른 API에서 의미가 달라 프로브를 오염시키므로 per-endpoint example_call 쪽이 맞다.
const SAMPLE_VALUES: Record<string, string> = {
  name: 'korea',
  currency: 'USD',
  from: 'USD',
  to: 'EUR',
  date: '2026-01-01',
  title: 'Seoul',
  breed: 'hound',
  width: '200',
  height: '300',
  category: 'Programming',
  id: '1',
  id_or_name: '1',
  word: 'hello',
  lawd_cd: '11110',
  deal_ymd: '202601',
  solyear: '2026',
  solmonth: '01',
  q: 'tolkien',
  query: 'seoul',
  s: 'chicken',
  amount: '1',
  limit: '1',
  size: '100x100',
  data: 'hello',
  hex: 'FF5733',
  lat: '37.5665',
  lng: '126.978',
  latitude: '37.5665',
  longitude: '126.978',
  // 공공데이터·관광 등 공통 페이징/포맷 파라미터 (제공자 간 의미가 분명한 것만)
  pageno: '1',
  numofrows: '1',
  datatype: 'JSON',
  returntype: 'json',
  _type: 'json',
  type: 'json',
  mobileos: 'ETC',
  mobileapp: 'CustomWebService',
};

// 키 인증용 파라미터는 테스트 쿼리에 넣지 않는다 (키리스로 호출해 401=key_gated 판정).
const AUTH_PARAM_NAMES = new Set([
  'servicekey',
  'api_key',
  'apikey',
  'appid',
  'key',
  'authorization',
  'token',
  'access_key',
]);

/** 알려진 안전한 샘플 값만 반환 (없으면 undefined — 쿼리에 임의값을 넣지 않기 위함). */
function knownSample(key: string): string | undefined {
  return SAMPLE_VALUES[key.toLowerCase()];
}

/** path placeholder용 — 경로엔 반드시 값이 필요하므로 미지의 키는 'test'로 대체. */
function sampleFor(key: string): string {
  return knownSample(key) ?? 'test';
}

export interface TestableEndpoint {
  path: string;
  parameters?: Record<string, unknown>;
  params?: Array<{ name?: string; required?: boolean; defaultValue?: string }>;
  exampleCall?: string;
  example_call?: string;
}

function collectParamNames(endpoint: TestableEndpoint): string[] {
  const names: string[] = [];
  if (endpoint.parameters && typeof endpoint.parameters === 'object') {
    names.push(...Object.keys(endpoint.parameters));
  }
  if (Array.isArray(endpoint.params)) {
    for (const p of endpoint.params) if (p?.name) names.push(p.name);
  }
  return names;
}

/** "/path?a=1&b=2" 형태의 plain example_call에서 쿼리만 추출 (proxy 스타일 예시는 무시). */
function parseExampleQuery(example: string | undefined): URLSearchParams | null {
  if (!example) return null;
  const trimmed = example.trim();
  if (!trimmed.startsWith('/') || !trimmed.includes('?')) return null;
  const qs = trimmed.slice(trimmed.indexOf('?') + 1);
  try {
    return new URLSearchParams(qs);
  } catch {
    return null;
  }
}

/**
 * 카탈로그 엔드포인트로부터 업스트림 테스트 URL을 만든다.
 * - path placeholder({name})를 샘플 값으로 치환
 * - base_url에 경로 prefix(예: /api/json/v1/1)가 있어도 보존 (문자열 결합)
 * - example_call의 쿼리 → parameters/params 순으로 쿼리 병합 (auth 파라미터 제외)
 */
/** path의 {placeholder}를 샘플 값으로 치환 (정규식 미사용 — ReDoS 회피). */
function fillPathPlaceholders(path: string, usedInPath: Set<string>): string {
  let out = '';
  let i = 0;
  while (i < path.length) {
    const open = path.indexOf('{', i);
    if (open === -1) {
      out += path.slice(i);
      break;
    }
    out += path.slice(i, open);
    const close = path.indexOf('}', open + 1);
    if (close === -1) {
      out += path.slice(open);
      break;
    }
    const key = path.slice(open + 1, close);
    usedInPath.add(key.toLowerCase());
    out += encodeURIComponent(sampleFor(key));
    i = close + 1;
  }
  return out;
}

/** 끝의 슬래시 제거 (정규식 미사용 — ReDoS 회피). */
function stripTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end -= 1;
  return s.slice(0, end);
}

export function buildTestUrl(baseUrl: string, endpoint: TestableEndpoint): string {
  const usedInPath = new Set<string>();
  const filledPath = fillPathPlaceholders(endpoint.path, usedInPath);

  const joined =
    stripTrailingSlashes(baseUrl) + (filledPath.startsWith('/') ? filledPath : `/${filledPath}`);
  const url = new URL(joined);

  // 1) example_call의 실제 값이 가장 정확 — 먼저 반영
  const exampleQuery = parseExampleQuery(endpoint.exampleCall ?? endpoint.example_call);
  if (exampleQuery) {
    for (const [k, v] of exampleQuery.entries()) {
      if (AUTH_PARAM_NAMES.has(k.toLowerCase())) continue;
      url.searchParams.set(k, v);
    }
  }

  // 2) 나머지 선언된 파라미터는 "알려진 안전한 샘플"이 있을 때만 채운다.
  //    (mode=test, lang=test 같은 임의값은 정상 API를 500/400으로 만들어 오탐을 유발 → 미지의 키는 생략)
  for (const name of collectParamNames(endpoint)) {
    const lk = name.toLowerCase();
    if (usedInPath.has(lk) || AUTH_PARAM_NAMES.has(lk)) continue;
    const sample = knownSample(name);
    if (sample === undefined) continue;
    if (!url.searchParams.has(name)) url.searchParams.set(name, sample);
  }

  return url.toString();
}
