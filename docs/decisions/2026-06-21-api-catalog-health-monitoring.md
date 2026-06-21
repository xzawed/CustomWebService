# API 카탈로그 동작 검증 & 헬스 모니터링 자동화 ADR (2026-06-21)

## 컨텍스트

"제공 중인 API가 정상 동작하는지, 그 과정이 WBS 기준으로 수행되는지"를 다이나믹 워크플로우 + 딥리서치로 전수 검증했다. 활성 31개 API를 라이브로 호출하고 독립 교차검증(15 에이전트)했다.

### 검증 결과 (2026-06-21, 검증 시점 활성 31개)

| 상태 | 수 | 비고 |
|------|----|------|
| 정상 동작 | 23 | 키 없이 즉시 호출 가능 (일부 성능/라이선스 리스크 동반) |
| 장애 | 1 | **REST Countries** — v3.1 전 엔드포인트 deprecated |
| 키 의존(런타임 검증 불가) | 7 | Unsplash·카카오 로컬/검색·공휴일·아파트 실거래가·기상청 단기/중기 |

### 핵심 발견 (근본 원인)

1. **REST Countries 장애가 프로덕션에 방치**: `/v3.1/*` 전 경로가 `legacy.json`으로 301(경로 stripping) → HTTP 200이지만 본문이 deprecation 에러 객체. 상태코드만 보는 검증을 통과해 국가 데이터 기능이 조용히 실패. 무료 키리스 대체 없음(v5는 유료·키 필요).
2. **모니터링 드리프트 (설계상)**: 일일 헬스체크(`scheduled.yml`)가 DB를 읽지 않고 **8개 하드코딩**. 그나마 카탈로그에서 **삭제된** Open Notify·Free Dictionary API를 테스트하고 Frankfurter는 **구도메인**(`api.frankfurter.app`)을 호출. 활성 31개 중 ~23개가 모니터링 사각 → REST Countries 장애 미탐지의 직접 원인.
3. **검증 도구 결함**: DB 기반 `verifyCatalog.ts`는 존재했으나 (a) `response.json()` 강제로 이미지 API 오탐, (b) 첫 3개 엔드포인트만, (c) 키/프록시 API는 localhost 프록시 의존(미검증), (d) 결과를 DB에 반영하지 않음(수동 backfill SQL 의존), (e) 어떤 CI/cron에도 미연결(수동 전용).
4. **키 거버넌스 부재**: 7개 API가 플랫폼 env 키에 의존하나 존재·유효성·한도 점검 자동화 전무 → 키 실패가 최종 사용자 런타임에서만 표면화.

## 결정 (이 PR의 변경)

### 1. REST Countries 폐기

프로덕션 DB에서 `is_active=false`, `deprecated_at=NOW()`, `verification_status='broken'`, `last_verification_note` 설정. 검색·추천(`is_active`/`deprecated_at` 필터)과 프록시(`api.isActive`)에서 즉시 제외.

- 적용/재현 SQL: [scripts/2026-06-21-deprecate-rest-countries.sql](../../scripts/2026-06-21-deprecate-rest-countries.sql)
- `supabase/seed.sql`의 REST Countries도 `is_active=false`로 동기화(신규 시드 재유입 방지).
- **권장 대체**: 오픈 데이터셋(`mledoze/countries`)을 번들/셀프호스트 후 자체 캐시 프록시로 서빙. 국가 데이터는 준-정적이라 주기적 갱신으로 충분 — 외부 의존·요청당 비용 제거. (별도 작업으로 추적)
- **DB 현황**: 활성 31 → **30**, 비활성 17 → 18, broken 1, 총 48.

### 2. 헬스체크를 DB 기반으로 전환 (`.github/workflows/scheduled.yml`)

하드코딩 8개를 폐기하고 **활성 카탈로그 전체를 DB에서 읽어** 업스트림을 라이브 검증한다(`pnpm catalog:healthcheck`). 읽기는 anon 키로 충분(RLS "Anyone can view active APIs"). **BROKEN 감지 시 exit 1 + 중복 방지 GitHub Issue 생성/갱신.** Frankfurter 구도메인·삭제 API 테스트 문제는 DB 기반 전환으로 구조적으로 해소.

### 3. 검증 도구 재작성 + 테스트 가능 모듈

- [src/lib/catalog/healthCheck.ts](../../src/lib/catalog/healthCheck.ts) — 순수 분류 로직(단위 테스트 대상, 33 케이스):
  - `classifyResponse`: working / degraded(느림>5s·429) / broken(네트워크·5xx·키리스 401·**2xx+에러/deprecation 본문**) / key_gated(키필요 API 401/403) / unknown(그 외 4xx — 파라미터 불일치 가능성, broken 단정 안 함)
  - `buildTestUrl`: path placeholder 치환, base_url 경로 prefix 보존, **알려진 안전한 샘플만** 쿼리 주입(임의값으로 정상 API를 깨뜨리는 오탐 방지), example_call 쿼리 병합
  - `summarizeApi`, `toVerificationStatus`
- [scripts/verifyCatalog.ts](../../scripts/verifyCatalog.ts) 재작성: **업스트림 DIRECT 호출**(localhost 프록시 제거), 전 엔드포인트 검증, 공개 default_key(NASA DEMO_KEY) 주입, non-JSON content-type 처리, **일시적 5xx/429/네트워크 1회 재시도**(플래키 오탐 감소), `--write` 시 DB `verification_status` 자동 반영, BROKEN이면 exit 1.

### 4. 플랫폼 키 유효성 검증 도구

[scripts/verifyPlatformKeys.ts](../../scripts/verifyPlatformKeys.ts) (`pnpm keys:verify`): 키 의존 API에 대해 **프록시와 동일한 방식으로 키를 주입**해 실제 인증 요청 → VALID/INVALID/MISSING/RATE_LIMITED/ERROR. 키 값은 출력하지 않음. Railway env가 있는 환경에서 실행(`railway run pnpm keys:verify`). 프록시와 동일 주입이므로 Kakao `KakaoAK `/Unsplash `Client-ID ` prefix 누락 같은 형식 문제도 INVALID로 드러난다.

### 5. package.json 스크립트

`catalog:healthcheck`, `catalog:healthcheck:write`, `keys:verify` 추가.

## 라이브 재검증 (이 PR 적용 후, 활성 30개)

`pnpm catalog:healthcheck` 실측: **working 21 · degraded 2(wheretheiss.at·NASA 지연) · key_gated 7 · broken 0 · unknown 0** (exit 0).

## WBS 기준 평가 — 이 PR가 다룬 범위

| WBS 작업 패키지 | 변경 전 | 이 PR | 잔여 |
|----------------|---------|-------|------|
| 2. 검증·등록 | partial(도구 결함) | 도구 결함 수정·전 엔드포인트·DB write-back·단위 테스트 | unverified 15개 일괄 재검증·`--write` 정기 실행 |
| 3. 모니터링·재검증 | **stale**(8개 하드코딩) | **DB 기반 일일 자동화 + Issue 알림** | 알림 채널(Slack) 연동 |
| 4. 폐기·교체 | partial | REST Countries 폐기 + 자동 broken 감지로 폐기 트리거 연결 | 교체 API(mledoze/countries) 구현 |
| 5. 키 거버넌스 | **missing** | 키 유효성 검증 도구 제공 | Railway env 정기 점검·만료 알림 자동화 |
| 6. 문서·추적성 | partial(휴면 컬럼) | 검증 결과 DB 반영 경로 마련 | 검색·추천에서 `verification_status` 소비, SoT 대시보드 |

## 잔여 / 후속 작업

- **🔑 키 유효성 검증(미완)**: Railway 접근 수단(token/CLI/MCP)이 작업 환경에 없어 7개 키의 실제 유효성을 확인하지 못했다. `railway run pnpm keys:verify`로 검증 필요. (사용자 액션 또는 RAILWAY_TOKEN 제공 시 실행)
- **프록시 키 주입 형식 점검**: 프록시는 키를 raw로 주입(`headers[param_name]=key`). Kakao는 `Authorization: KakaoAK <key>`, Unsplash는 `Authorization: Client-ID <key>` 형식이 필요 — env 값에 prefix가 포함돼야 함. `keys:verify`로 검증 권장(별도 확인 항목).
- **`verification_status` 소비(P1)**: 현재 검색·AI 추천이 이 컬럼을 사용하지 않음(휴면). broken 제외·verified 우선 가중치 적용 필요.
- **라이선스/키 정책**: Open-Meteo 상업 사용 ToS(유료 플랜/셀프호스트), NASA DEMO_KEY→등록 키, data.go.kr 단일키→BYOK/운영계정. (딥리서치 근거)
- **seed.sql 전면 재동기화**: 이번엔 REST Countries·Frankfurter만 정정. 삭제된 API(Open Notify·Free Dictionary·LibreTranslate 등) 잔존 — 별도 작업으로 프로덕션 DB와 전면 동기화 필요.

## 롤백

- REST Countries: `is_active=true, deprecated_at=NULL, verification_status='unverified'`.
- scheduled.yml / 스크립트: git revert.
