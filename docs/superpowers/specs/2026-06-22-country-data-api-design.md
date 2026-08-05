<!-- DOC_STATUS: HISTORICAL | completed: 2026-06-22 | superseded_by: docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md -->
# 자체 호스팅 국가 데이터 API (REST Countries 대체) — 설계

- 날짜: 2026-06-22
- 상태: **완료** — 구현(PR #158 배포 라이브) + **카탈로그 등록 완료(2026-06-22)**. 등록 ADR: [2026-06-22-catalog-registration-and-seed-resync.md](../../decisions/2026-06-22-catalog-registration-and-seed-resync.md)
- 배경: 잔여작업 감사 **B-3**. REST Countries v3.1 전면 deprecated(2026-06-21 비활성)로 무료·키리스 국가 데이터 공백. 무료 키리스 v3.1 대체 없음(v5 유료).
- 선행: [docs/decisions/2026-06-21-api-catalog-health-monitoring.md](../../decisions/2026-06-21-api-catalog-health-monitoring.md) (REST Countries 폐기 결정 1·WBS 4)

## 목표

mledoze/countries 데이터셋의 **큐레이티드 서브셋**을 레포에 번들하고, 자체 도메인에서
**키리스·CORS·캐시** API로 서빙해 카탈로그에 등록한다. 생성된 사이트가 REST Countries처럼
**직접 fetch**(프록시 없이)할 수 있어야 한다.

## 비목표 (YAGNI)

- 국경 geojson, 전 언어 번역, 동전/지폐 이미지 등 풀 데이터셋 필드.
- 이름 기반 fuzzy 검색 엔진(단순 substring 필터로 충분).
- 런타임 외부 fetch(데이터는 준-정적 — 빌드 산출물로 번들).
- 인증·레이트리밋(공개 정적 데이터, 저비용).

## 데이터

### 소스 & 라이선스
- 소스: [mledoze/countries](https://github.com/mledoze/countries) `countries.json` (GitHub raw, master).
- 라이선스: **ODbL** — attribution 필요. 데이터 파일 헤더/응답 또는 카탈로그 docs에 출처 명시.

### 생성 스크립트
- `scripts/generateCountries.ts` — mledoze raw JSON을 fetch → 큐레이티드 변환 → `src/data/countries.json`에 **커밋**.
- 준-정적이라 수동/주기 재실행(빌드 의존 아님). 변환 로직(순수 함수)은 단위 테스트 대상.

### 큐레이티드 스키마 (국가당)
> mledoze `countries.json` 실측 필드 기준(2026-06-22 확인): `population`·`flags`(png/svg)·`timezones`는
> **소스에 없음** → `population` 제외, `area`(km²) 사용, `flagSvg`는 flagcdn URL로 구성.
```ts
interface Country {
  name: { common: string; official: string; ko: string | null }; // translations.kor.common
  cca2: string;   // "KR"
  cca3: string;   // "KOR"
  ccn3: string | null;
  capital: string | null;       // mledoze capital[0]
  region: string;               // "Asia"
  subregion: string | null;
  flag: string;                 // emoji "🇰🇷"
  flagSvg: string | null;       // `https://flagcdn.com/${cca2}.svg` (구성, img-src * 허용)
  currencies: Record<string, { name: string; symbol: string | null }>;
  languages: Record<string, string>;
  area: number | null;          // km² (mledoze area)
  latlng: number[];             // [lat, lng]
  callingCode: string | null;   // idd.root(+suffix) — suffix 1개면 결합, 아니면 root
  tld: string | null;           // top-level domain 첫 항목 ".kr"
}
```
- `src/data/countries.json` (생성 산출물, 커밋) — 라우트가 import해 standalone 번들. 타입은 `src/lib/countries/types.ts`.
- 예상 크기: 약 수백 KB(전체 ~3MB 대비 대폭 축소).

## 서빙 라우트

`src/app/api/v1/countries/route.ts` 및 `src/app/api/v1/countries/[code]/route.ts`.

### 엔드포인트
| 메서드·경로 | 동작 | 응답 |
|---|---|---|
| `GET /api/v1/countries` | 전체 목록. `?region=` (region/subregion, 대소문자 무시), `?search=` (name.common/official/ko substring) 선택 필터 | 바로 배열 `Country[]` |
| `GET /api/v1/countries/{code}` | cca2/cca3 코드(대소문자 무시) 단건 | `Country` 객체, 미존재 시 `404 { error }` |
| `OPTIONS` (양 경로) | CORS preflight | `204` + CORS 헤더 |

- 응답 형태는 REST Countries처럼 **bare array/object**(내부 `jsonResponse` 엔벨로프 미사용) — 생성 사이트 소비 용이.

### 헤더
- `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`.
- `Cache-Control: public, max-age=86400` (준-정적; 길게 캐시).
- `dynamic = 'force-static'` 불가(쿼리 필터) → 동적 라우트 + 명시적 캐시 헤더.

### 공유 로직
- 필터·코드 조회는 순수 함수(`src/lib/countries/*` 또는 라우트 인접)로 추출해 단위 테스트.
  라우트는 thin 래퍼.

## CSP

**변경 불필요**. 사이트 CSP는 `connect-src 'self' https: wss:`([src/lib/constants/cdn.ts](../../../src/lib/constants/cdn.ts) `buildSiteCsp`)로 모든 https 출처를 허용 → `https://xzawed.xyz/api/v1/countries` 직접 fetch 허용. 라우트의 CORS 헤더만 필요.

## 카탈로그 등록 (프로덕션 Supabase insert)

신규 `api_catalog` row:
- `name`: "Countries (Self-hosted)" / 설명 한국어
- `category`: `data`
- `base_url`: `https://xzawed.xyz`
- `endpoints`: `/api/v1/countries`(전체 목록), `/api/v1/countries/{code}`(코드 조회)
- `auth_type`: `none`, `requires_proxy`: `false`, `cors_supported`: `true`
- `verification_status`: `verified`, `is_active`: `true`
- REST Countries row: 비활성 유지 + `successor_id`를 신규 row로 연결.

## 테스트

- `src/app/api/v1/countries/**/route.ts`를 `vitest.config.ts` `coverage.include`에 추가(SonarCloud new-code 게이트).
- 라우트 통합 테스트: 목록 반환·region/search 필터·코드 조회(대소문자)·404·CORS/OPTIONS 헤더.
- 변환/필터 순수 함수 단위 테스트(빈 capital, kor 번역 없음, idd 결합 등 엣지).
- 생성 스크립트는 변환 함수만 테스트(네트워크 fetch는 미테스트).

## 헬스 모니터링 영향

일일 cron이 신규 활성 API를 자동 검증 → `https://xzawed.xyz/api/v1/countries` 200 JSON → `working`.
자체 도메인이라 안정적. (코드 substitution `{code}`는 기존 검증기와 동일 처리.)

## 문서

- 본 스펙 + 구현 후 ADR(또는 헬스 모니터링 ADR의 REST Countries 잔여 항목 완료 표기).
- CLAUDE.md: 신규 라우트(`api/v1/countries`)·카탈로그 등록·데이터 번들 gotcha.

## 롤백

- 라우트/데이터/스크립트 제거 + 카탈로그 row `is_active=false`. 생성된 사이트는 baked URL 유지(영향은 신규 생성만).
