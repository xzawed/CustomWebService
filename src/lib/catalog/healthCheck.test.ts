import { describe, it, expect } from 'vitest';
import {
  classifyResponse,
  looksLikeErrorBody,
  summarizeApi,
  buildTestUrl,
  toVerificationStatus,
  SLOW_THRESHOLD_MS,
  type HealthStatus,
} from './healthCheck';
import { classifyKeyResponse } from './keyCheck';

const base = {
  authType: 'none' as const,
  httpStatus: 200,
  contentType: 'application/json',
  bodyText: '{"results":[1,2,3]}',
  elapsedMs: 120,
};

describe('looksLikeErrorBody', () => {
  // ── Shape A: response.header.resultCode ──────────────────────────────────
  it('Shape A JSON 성공 코드(00)는 에러가 아니다', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' } } }),
      ),
    ).toBe(false);
  });

  it('Shape A JSON 성공 코드(0000 / INFO-000)는 에러가 아니다', () => {
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: '0000' } } })),
    ).toBe(false);
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: 'INFO-000' } } })),
    ).toBe(false);
  });

  it('Shape A JSON 에러 코드(01)는 에러다', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({
          response: { header: { resultCode: '01', resultMsg: 'APPLICATION_ERROR' } },
        }),
      ),
    ).toBe(true);
  });

  it('Shape A JSON 미지 코드는 fail-closed로 에러다', () => {
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: '99' } } })),
    ).toBe(true);
  });

  it('Shape A XML 성공(00)은 에러가 아니고 에러 코드는 에러다', () => {
    expect(
      looksLikeErrorBody(
        '<response><header><resultCode>00</resultCode><resultMsg>NORMAL_SERVICE</resultMsg></header><body/></response>',
      ),
    ).toBe(false);
    expect(
      looksLikeErrorBody(
        '<response><header><resultCode>30</resultCode><resultMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</resultMsg></header></response>',
      ),
    ).toBe(true);
  });

  // ── 허용 코드: 03 NO_DATA, 22 LIMIT_EXCEEDED ─────────────────────────────
  it('resultCode 03(NO_DATA)은 에러가 아니다 (인증 성공·조회 결과 없음)', () => {
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: '03' } } })),
    ).toBe(false);
  });

  it('resultCode 22(LIMIT_EXCEEDED)는 에러가 아니다 (429는 별도 분류)', () => {
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: '22' } } })),
    ).toBe(false);
  });

  // ── Shape B: OpenAPI_ServiceResponse.cmmMsgHeader ────────────────────────
  it('Shape B JSON returnReasonCode 에러는 에러다', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({
          OpenAPI_ServiceResponse: {
            cmmMsgHeader: { returnReasonCode: '30', errMsg: 'SERVICE ERROR' },
          },
        }),
      ),
    ).toBe(true);
  });

  it('Shape B JSON 허용 코드(00)는 에러가 아니다', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({
          OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '00' } },
        }),
      ),
    ).toBe(false);
  });

  it('Shape B XML returnReasonCode 에러는 에러다', () => {
    expect(
      looksLikeErrorBody(
        '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><errMsg>SERVICE ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>',
      ),
    ).toBe(true);
  });

  it('Shape B XML errMsg만 있어도 인식된 엔벨로프면 에러다', () => {
    expect(
      looksLikeErrorBody(
        '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>',
      ),
    ).toBe(true);
  });

  // ── Shape A′: 최상위 header.resultCode + resultMsg (response 래퍼 없음) ──
  it('Shape A′ JSON 에러 코드(01)는 에러다', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({ header: { resultCode: '01', resultMsg: 'APPLICATION_ERROR' } }),
      ),
    ).toBe(true);
  });

  it('Shape A′ XML 에러 코드는 에러다', () => {
    expect(
      looksLikeErrorBody(
        '<header><resultCode>01</resultCode><resultMsg>APPLICATION_ERROR</resultMsg></header>',
      ),
    ).toBe(true);
  });

  // ── 실측 본문 픽스처 (2026-08-05 라이브 캡처) ────────────────────────────
  it('실측 본문: 기상청 단기예보 APPLICATION_ERROR(01)은 에러로 잡는다', () => {
    // 기상청 단기예보 — bad params, HTTP 200, response 래퍼 없음
    expect(
      looksLikeErrorBody('{"header":{"resultCode":"01","resultMsg":"APPLICATION_ERROR"}}'),
    ).toBe(true);
  });

  it('실측 본문: 기상청 중기예보 DB_ERROR(02)은 에러로 잡는다', () => {
    expect(
      looksLikeErrorBody('{"header":{"resultCode":"02","resultMsg":"DB_ERROR"}}'),
    ).toBe(true);
  });

  it('실측 본문: 에어코리아 INVALID_REQUEST_PARAMETER_ERROR(10)은 에러로 잡는다', () => {
    expect(
      looksLikeErrorBody(
        '{"header":{"resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR"}}',
      ),
    ).toBe(true);
  });

  it('실측 본문: NO_DATA(03) response 래핑은 에러가 아니다', () => {
    expect(
      looksLikeErrorBody(
        '{"response":{"header":{"resultCode":"03","resultMsg":"NO_DATA"}}}',
      ),
    ).toBe(false);
  });

  it('실측 본문: 국토부 전월세 XML 000+빈 items는 에러가 아니다 (성공·빈 결과)', () => {
    // 국토부 전월세 — resultCode 000 허용목록, totalCount 0. codegen 유용성 문제는 Part 3.
    expect(
      looksLikeErrorBody(
        '<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items/><totalCount>0</totalCount></body></response>',
      ),
    ).toBe(false);
  });

  it('실측 본문: 게이트웨이 OpenAPI_ServiceResponse returnReasonCode 12는 에러다', () => {
    expect(
      looksLikeErrorBody(
        '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICE ERROR","returnReasonCode":"12"}}}',
      ),
    ).toBe(true);
  });

  // ── 오탐 가드 ────────────────────────────────────────────────────────────
  it('최상위 bare resultCode는 엔벨로프가 아니므로 에러로 보지 않는다', () => {
    expect(looksLikeErrorBody('{"resultCode":"01"}')).toBe(false);
  });

  it('Shape A′ 가드: 최상위 header에 resultCode만 있고 resultMsg 없으면 false', () => {
    expect(looksLikeErrorBody('{"header":{"resultCode":"01"}}')).toBe(false);
  });

  it('Shape A′ 가드: 관련 없는 최상위 header(title)는 false', () => {
    expect(looksLikeErrorBody('{"header":{"title":"x"}}')).toBe(false);
  });

  it('기존 REST 성공 형태는 회귀 없이 false', () => {
    expect(looksLikeErrorBody('{"result":"success"}')).toBe(false);
    expect(looksLikeErrorBody('{"status":"success"}')).toBe(false);
    expect(looksLikeErrorBody('{"error":false}')).toBe(false);
    expect(looksLikeErrorBody('{"response":{}}')).toBe(false);
  });

  it('관련 없는 XML(마커 없음)은 false', () => {
    expect(looksLikeErrorBody('<root><item>ok</item></root>')).toBe(false);
  });

  it('deprecation 텍스트는 여전히 에러다', () => {
    expect(looksLikeErrorBody('This API version has been deprecated.')).toBe(true);
  });

  it('기존 REST 휴리스틱(success:false / errors[])은 유지된다', () => {
    expect(looksLikeErrorBody('{"success":false}')).toBe(true);
    expect(looksLikeErrorBody('{"errors":[{"message":"bad"}]}')).toBe(true);
  });

  // ── 분기 커버: 엔벨로프 불일치·경계 (CI codecov/patch) ───────────────────
  it('파싱 불가 JSON({로 시작)은 throw 없이 폴스루한다', () => {
    // looksLikeJson true → JSON.parse 실패 → 엔벨로프 null → REST false
    expect(looksLikeErrorBody('{not-valid-json')).toBe(false);
  });

  it('JSON 배열 본문은 엔벨로프가 아니다', () => {
    expect(looksLikeErrorBody('[1,2]')).toBe(false);
  });

  it('response만 있고 header가 없거나 객체가 아니면 엔벨로프 불일치', () => {
    expect(looksLikeErrorBody(JSON.stringify({ response: { body: {} } }))).toBe(false);
    expect(looksLikeErrorBody(JSON.stringify({ response: { header: null } }))).toBe(false);
    expect(looksLikeErrorBody(JSON.stringify({ response: { header: 'x' } }))).toBe(false);
    expect(looksLikeErrorBody(JSON.stringify({ response: { header: [] } }))).toBe(false);
    expect(looksLikeErrorBody(JSON.stringify({ response: null }))).toBe(false);
    expect(looksLikeErrorBody(JSON.stringify({ response: 'x' }))).toBe(false);
  });

  it('header.resultCode가 string/number가 아니면 엔벨로프로 보지 않는다', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({ response: { header: { resultCode: { nested: true } } } }),
      ),
    ).toBe(false);
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: null } } })),
    ).toBe(false);
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: ['01'] } } })),
    ).toBe(false);
    // 숫자 코드는 허용 — 허용목록 밖이면 에러
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: 99 } } })),
    ).toBe(true);
    expect(
      looksLikeErrorBody(JSON.stringify({ response: { header: { resultCode: 0 } } })),
    ).toBe(true); // "0"은 허용목록에 없음 (00만 허용)
  });

  it('Shape A′ resultMsg가 빈 문자열·공백·비문자열이면 가드에 걸린다', () => {
    expect(
      looksLikeErrorBody(JSON.stringify({ header: { resultCode: '01', resultMsg: '' } })),
    ).toBe(false);
    expect(
      looksLikeErrorBody(JSON.stringify({ header: { resultCode: '01', resultMsg: '   ' } })),
    ).toBe(false);
    expect(
      looksLikeErrorBody(JSON.stringify({ header: { resultCode: '01', resultMsg: 123 } })),
    ).toBe(false);
    expect(looksLikeErrorBody(JSON.stringify({ header: null }))).toBe(false);
    expect(looksLikeErrorBody(JSON.stringify({ header: 'x' }))).toBe(false);
  });

  it('Shape B: cmmMsgHeader만 있고 코드·errMsg 없으면 fail-closed true', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: {} } }),
      ),
    ).toBe(true);
  });

  it('Shape B: errMsg가 빈 문자열이어도 fail-closed true', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({
          OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: '' } },
        }),
      ),
    ).toBe(true);
    expect(
      looksLikeErrorBody(
        JSON.stringify({
          OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: '   ' } },
        }),
      ),
    ).toBe(true);
  });

  it('Shape B: OpenAPI_ServiceResponse만 있고 cmmMsgHeader 없으면 엔벨로프 불일치', () => {
    expect(
      looksLikeErrorBody(JSON.stringify({ OpenAPI_ServiceResponse: { other: true } })),
    ).toBe(false);
    expect(
      looksLikeErrorBody(JSON.stringify({ OpenAPI_ServiceResponse: null })),
    ).toBe(false);
    expect(
      looksLikeErrorBody(JSON.stringify({ OpenAPI_ServiceResponse: 'x' })),
    ).toBe(false);
  });

  it('Shape B: returnReasonCode 숫자 타입도 판정한다', () => {
    expect(
      looksLikeErrorBody(
        JSON.stringify({
          OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: 12 } },
        }),
      ),
    ).toBe(true);
    expect(
      looksLikeErrorBody(
        JSON.stringify({
          OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: 0 } },
        }),
      ),
    ).toBe(true); // "0" ≠ "00"
  });

  it('XML: <response>에 <header> 없으면 엔벨로프 불일치', () => {
    expect(looksLikeErrorBody('<response><body/></response>')).toBe(false);
  });

  it('XML: <header>에 <resultCode> 없으면 엔벨로프 불일치', () => {
    expect(
      looksLikeErrorBody('<response><header><resultMsg>X</resultMsg></header></response>'),
    ).toBe(false);
  });

  it('XML: 닫히지 않은 태그는 extract 실패로 불일치', () => {
    expect(looksLikeErrorBody('<header><resultCode>01</resultCode>')).toBe(false);
    expect(
      looksLikeErrorBody('<response><header><resultCode>01</resultCode></header>'),
    ).toBe(false);
  });

  it('XML Shape A′: resultMsg 없으면 엄격 가드로 false', () => {
    expect(
      looksLikeErrorBody('<header><resultCode>01</resultCode></header>'),
    ).toBe(false);
    expect(
      looksLikeErrorBody(
        '<header><resultCode>01</resultCode><resultMsg></resultMsg></header>',
      ),
    ).toBe(false);
  });

  it('XML Shape A′: 허용 코드는 false', () => {
    expect(
      looksLikeErrorBody(
        '<header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>',
      ),
    ).toBe(false);
  });

  it('XML Shape B: cmmMsgHeader만 있으면 fail-closed true', () => {
    expect(
      looksLikeErrorBody(
        '<OpenAPI_ServiceResponse><cmmMsgHeader></cmmMsgHeader></OpenAPI_ServiceResponse>',
      ),
    ).toBe(true);
  });

  it('XML Shape B: 허용 returnReasonCode는 false', () => {
    expect(
      looksLikeErrorBody(
        '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>00</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
      ),
    ).toBe(false);
  });

  it('XML Shape B: OpenAPI_ServiceResponse만 있고 cmmMsgHeader 없으면 불일치', () => {
    expect(
      looksLikeErrorBody('<OpenAPI_ServiceResponse><other/></OpenAPI_ServiceResponse>'),
    ).toBe(false);
  });

  it('JSON 허용 코드(false) 판정은 null이 아니므로 유지된다', () => {
    // ?? 연산: false는 XML 폴스루 대상이 아님. 허용 코드 → false 그대로.
    expect(
      looksLikeErrorBody(
        JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' } } }),
      ),
    ).toBe(false);
    // 동시에 XML 성공 본문도 false (별도 경로, 동일 허용목록)
    expect(
      looksLikeErrorBody(
        '<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header></response>',
      ),
    ).toBe(false);
  });
});

describe('classifyResponse', () => {
  it('treats a valid 2xx JSON body as working', () => {
    expect(classifyResponse(base).status).toBe('working');
  });

  it('treats a 2xx non-JSON (image) response as working', () => {
    expect(
      classifyResponse({ ...base, contentType: 'image/png', bodyText: '' }).status,
    ).toBe('working');
  });

  it('degrades a working response that is slow', () => {
    expect(
      classifyResponse({ ...base, elapsedMs: SLOW_THRESHOLD_MS + 1 }).status,
    ).toBe('degraded');
  });

  it('flags a 2xx body with success:false as broken (deprecation masking)', () => {
    expect(
      classifyResponse({
        ...base,
        bodyText:
          '{"success":false,"data":null,"errors":[{"message":"This API version has been deprecated"}]}',
      }).status,
    ).toBe('broken');
  });

  it('flags a 2xx body with a non-empty errors array as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"errors":[{"message":"bad"}]}' }).status,
    ).toBe('broken');
  });

  it('flags a 2xx body whose text contains a deprecation notice as broken', () => {
    expect(
      classifyResponse({
        ...base,
        contentType: 'text/plain',
        bodyText: 'This API version has been deprecated. Migrate to v5.',
      }).status,
    ).toBe('broken');
  });

  it('does NOT flag error:false (JokeAPI shape) as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"error":false,"joke":"x"}' }).status,
    ).toBe('working');
  });

  it('does NOT flag result:"success" (ExchangeRate shape) as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"result":"success","rates":{}}' }).status,
    ).toBe('working');
  });

  it('does NOT flag status:"success" (Dog API shape) as broken', () => {
    expect(
      classifyResponse({ ...base, bodyText: '{"status":"success","message":"url"}' }).status,
    ).toBe('working');
  });

  it('treats a raw JSON array (Hacker News shape) as working', () => {
    expect(classifyResponse({ ...base, bodyText: '[1,2,3]' }).status).toBe('working');
  });

  it('classifies 401 for a keyed API as key_gated (host alive)', () => {
    expect(
      classifyResponse({ ...base, authType: 'api_key', httpStatus: 401, bodyText: 'Unauthorized' }).status,
    ).toBe('key_gated');
  });

  it('classifies 403 for a keyed API as key_gated', () => {
    expect(
      classifyResponse({ ...base, authType: 'api_key', httpStatus: 403, bodyText: '' }).status,
    ).toBe('key_gated');
  });

  it('classifies 401 for a keyless API as broken (unexpected)', () => {
    expect(
      classifyResponse({ ...base, authType: 'none', httpStatus: 401, bodyText: '' }).status,
    ).toBe('broken');
  });

  it('classifies 429 as degraded (rate limited but alive)', () => {
    expect(classifyResponse({ ...base, httpStatus: 429, bodyText: '' }).status).toBe('degraded');
  });

  it('classifies 5xx as broken', () => {
    expect(classifyResponse({ ...base, httpStatus: 503, bodyText: '' }).status).toBe('broken');
  });

  it('classifies a network error as broken', () => {
    expect(
      classifyResponse({ ...base, httpStatus: 0, networkError: true, bodyText: '' }).status,
    ).toBe('broken');
  });

  it('classifies an unexpected 4xx (likely test-param mismatch) as unknown, not broken', () => {
    expect(classifyResponse({ ...base, httpStatus: 404, bodyText: 'Not Found' }).status).toBe('unknown');
  });

  it('HTTP 200 + Shape A 에러 엔벨로프 → broken', () => {
    expect(
      classifyResponse({
        ...base,
        bodyText: JSON.stringify({
          response: { header: { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } },
        }),
      }).status,
    ).toBe('broken');
  });

  it('HTTP 200 + 실측 최상위 header APPLICATION_ERROR(01) → broken', () => {
    expect(
      classifyResponse({
        ...base,
        bodyText: '{"header":{"resultCode":"01","resultMsg":"APPLICATION_ERROR"}}',
      }).status,
    ).toBe('broken');
  });
});

describe('classifyKeyResponse + data.go.kr 엔벨로프', () => {
  it('HTTP 200 + Shape A 에러 엔벨로프 → INVALID', () => {
    const body = JSON.stringify({
      response: { header: { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } },
    });
    expect(classifyKeyResponse(200, body, false).verdict).toBe('INVALID');
  });

  it('HTTP 200 + Shape A NO_DATA(03) → VALID (키는 통과)', () => {
    const body = JSON.stringify({ response: { header: { resultCode: '03' } } });
    expect(classifyKeyResponse(200, body, false).verdict).toBe('VALID');
  });

  it('HTTP 200 + 실측 최상위 header APPLICATION_ERROR(01) → INVALID', () => {
    expect(
      classifyKeyResponse(
        200,
        '{"header":{"resultCode":"01","resultMsg":"APPLICATION_ERROR"}}',
        false,
      ).verdict,
    ).toBe('INVALID');
  });
});

describe('summarizeApi', () => {
  const cases: Array<[HealthStatus[], HealthStatus]> = [
    [['working', 'working'], 'working'],
    [['working', 'broken'], 'broken'],
    [['key_gated', 'key_gated'], 'key_gated'],
    [['working', 'degraded'], 'degraded'],
    [['key_gated', 'working'], 'working'],
    [['working', 'unknown'], 'working'],
    [[], 'unknown'],
  ];
  it.each(cases)('summarizes %j as %s', (input, expected) => {
    expect(summarizeApi(input)).toBe(expected);
  });
});

describe('toVerificationStatus', () => {
  it('maps working/degraded to verified', () => {
    expect(toVerificationStatus('working')).toBe('verified');
    expect(toVerificationStatus('degraded')).toBe('verified');
  });
  it('maps broken to broken', () => {
    expect(toVerificationStatus('broken')).toBe('broken');
  });
  it('returns null for key_gated/unknown (do not clobber DB)', () => {
    expect(toVerificationStatus('key_gated')).toBeNull();
    expect(toVerificationStatus('unknown')).toBeNull();
  });
});

describe('buildTestUrl', () => {
  it('substitutes a single path placeholder', () => {
    expect(buildTestUrl('https://restcountries.com', { path: '/v3.1/name/{name}' })).toBe(
      'https://restcountries.com/v3.1/name/korea',
    );
  });

  it('substitutes multiple path placeholders (width/height)', () => {
    expect(buildTestUrl('https://picsum.photos', { path: '/{width}/{height}' })).toBe(
      'https://picsum.photos/200/300',
    );
  });

  it('preserves a base URL that already contains a path prefix', () => {
    expect(
      buildTestUrl('https://www.themealdb.com/api/json/v1/1', { path: '/random.php' }),
    ).toBe('https://www.themealdb.com/api/json/v1/1/random.php');
  });

  it('adds object-map query params with sensible samples', () => {
    const url = buildTestUrl('https://opentdb.com', {
      path: '/api.php',
      parameters: { amount: 'number' },
    });
    expect(url).toContain('amount=1');
  });

  it('skips auth params (api_key) when building the query', () => {
    const url = buildTestUrl('https://api.nasa.gov', {
      path: '/planetary/apod',
      parameters: { date: 'string', api_key: 'string' },
    });
    expect(url).not.toContain('api_key=');
  });

  it('merges params from a plain example_call query string', () => {
    const url = buildTestUrl('https://api.open-meteo.com', {
      path: '/v1/forecast',
      exampleCall: '/v1/forecast?latitude=37.5665&longitude=126.9780&current_weather=true',
    });
    expect(url).toContain('latitude=37.5665');
    expect(url).toContain('longitude=126.9780');
  });

  it('공공데이터 공통 페이징/포맷 파라미터에 안전한 샘플을 채운다', () => {
    const url = buildTestUrl('https://apis.data.go.kr/example', {
      path: '/getItems',
      parameters: {
        pageNo: 'string',
        numOfRows: 'string',
        dataType: 'string',
        MobileOS: 'string',
        MobileApp: 'string',
      },
    });
    expect(url).toContain('pageNo=1');
    expect(url).toContain('numOfRows=1');
    expect(url).toContain('dataType=JSON');
    expect(url).toContain('MobileOS=ETC');
    expect(url).toContain('MobileApp=CustomWebService');
  });
});
