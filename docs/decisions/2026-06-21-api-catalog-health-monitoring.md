# API 카탈로그 동작 검증 & 헬스 모니터링 자동화 ADR (2026-06-21)

> **참고 (2026-08-03, C7)**: 본 ADR이 가리키던 1회성 SQL 파일들은 Supabase/Postgres 백엔드 대상이었고, 2026-06-23 SQLite 컷오버로 그 백엔드가 제거되어 삭제했다. 적용 결과(비활성·env_var 수정 등)는 본문 기록으로 남는다.

> **언제 읽나**: 카탈로그 API를 활성화·비활성화하거나, keys-verify / verify-catalog / healthCheck.classifyResponse·looksLikeErrorBody 를 손댈 때 — 상태코드만 보던 검증이 2xx+에러 본문 API를 프로덕션에 방치한 인시던트

> ⚠️ **본문의 CLI는 전부 제거됐다** — `pnpm catalog:healthcheck` · `catalog:healthcheck:write` · `keys:verify` 는 SQLite 컷오버로 사라졌고 `scheduled.yml` 일일 잡도 없다. **현행 수단은 런타임 관리자 엔드포인트**: `GET /api/v1/admin/keys-verify`(진단·단발) · `POST /api/v1/admin/verify-catalog`(수동 트리거) · `POST /api/v1/admin/catalog/{activate,deactivate}`. 분류 로직 `src/lib/catalog/healthCheck.ts` 는 그대로 살아 있다. 아래 본문은 **결정 당시의 기록**으로 읽을 것.

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

- 적용/재현 SQL: `scripts/2026-06-21-deprecate-rest-countries.sql`
- `supabase/seed.sql`의 REST Countries도 `is_active=false`로 동기화(신규 시드 재유입 방지).
- **권장 대체**: 오픈 데이터셋(`mledoze/countries`)을 번들/셀프호스트 후 자체 캐시 프록시로 서빙. 국가 데이터는 준-정적이라 주기적 갱신으로 충분 — 외부 의존·요청당 비용 제거. → ✅ **구현 완료(2026-06-22, B-3)**: `src/data/countries.json` 번들 + `GET /api/v1/countries`·`/[code]` 자체 서빙(키리스·CORS). 설계 [docs/superpowers/specs/2026-06-22-country-data-api-design.md](../superpowers/specs/2026-06-22-country-data-api-design.md). 카탈로그 등록은 배포 후 단계.
- **DB 현황**: 활성 31 → **30**, 비활성 17 → 18, broken 1, 총 48.

### 2. 헬스체크를 DB 기반으로 전환 (`.github/workflows/scheduled.yml`)

하드코딩 8개를 폐기하고 **활성 카탈로그 전체를 DB에서 읽어** 업스트림을 라이브 검증한다(`pnpm catalog:healthcheck`). 읽기는 anon 키로 충분(RLS "Anyone can view active APIs"). **BROKEN 감지 시 exit 1 + 중복 방지 GitHub Issue 생성/갱신.** Frankfurter 구도메인·삭제 API 테스트 문제는 DB 기반 전환으로 구조적으로 해소.

### 3. 검증 도구 재작성 + 테스트 가능 모듈

- [src/lib/catalog/healthCheck.ts](../../src/lib/catalog/healthCheck.ts) — 순수 분류 로직(단위 테스트 대상, 33 케이스):
  - `classifyResponse`: working / degraded(느림>5s·429) / broken(네트워크·5xx·키리스 401·**2xx+에러/deprecation 본문**) / key_gated(키필요 API 401/403) / unknown(그 외 4xx — 파라미터 불일치 가능성, broken 단정 안 함)
  - `buildTestUrl`: path placeholder 치환, base_url 경로 prefix 보존, **알려진 안전한 샘플만** 쿼리 주입(임의값으로 정상 API를 깨뜨리는 오탐 방지), example_call 쿼리 병합
  - `summarizeApi`, `toVerificationStatus`
- `scripts/verifyCatalog.ts`(후속 SQLite 컷오버로 **제거됨**. 현행 대체: `POST /api/v1/admin/verify-catalog` + `src/lib/catalog/verifyRunner.ts`) 재작성: **업스트림 DIRECT 호출**(localhost 프록시 제거), 전 엔드포인트 검증, 공개 default_key(NASA DEMO_KEY) 주입, non-JSON content-type 처리, **일시적 5xx/429/네트워크 1회 재시도**(플래키 오탐 감소), `--write` 시 DB `verification_status` 자동 반영, BROKEN이면 exit 1.

### 4. 플랫폼 키 유효성 검증 도구

`scripts/verifyPlatformKeys.ts` / `pnpm keys:verify`(후속 SQLite 컷오버로 **제거됨**. 현행 대체: `GET /api/v1/admin/keys-verify` + `src/lib/catalog/keyCheck.ts`): 키 의존 API에 대해 **프록시와 동일한 방식으로 키를 주입**해 실제 인증 요청 → VALID/INVALID/MISSING/RATE_LIMITED/ERROR. 키 값은 출력하지 않음. Railway env가 있는 환경에서 실행하던 도구였다. 프록시와 동일 주입이므로 Kakao `KakaoAK `/Unsplash `Client-ID ` prefix 누락 같은 형식 문제도 INVALID로 드러난다.

### 5. package.json 스크립트

`catalog:healthcheck`, `catalog:healthcheck:write`, `keys:verify` 추가.

## 라이브 재검증 (이 PR 적용 후, 활성 30개)

`pnpm catalog:healthcheck` 실측: **working 21 · degraded 2(wheretheiss.at·NASA 지연) · key_gated 7 · broken 0 · unknown 0** (exit 0).

## WBS 기준 평가 — 이 PR가 다룬 범위

| WBS 작업 패키지 | 변경 전 | 이 PR | 잔여 |
|----------------|---------|-------|------|
| 2. 검증·등록 | partial(도구 결함) | 도구 결함 수정·전 엔드포인트·DB write-back·단위 테스트 | unverified 15개 일괄 재검증·`--write` 정기 실행 |
| 3. 모니터링·재검증 | **stale**(8개 하드코딩) | **DB 기반 일일 자동화 + Issue 알림** | 알림 채널(Slack) 연동 |
| 4. 폐기·교체 | partial | REST Countries 폐기 + 자동 broken 감지로 폐기 트리거 연결 | ✅ 교체 API(mledoze/countries) 구현 완료(2026-06-22, B-3) |
| 5. 키 거버넌스 | **missing** | 키 유효성 검증 도구 제공 | Railway env 정기 점검·만료 알림 자동화 |
| 6. 문서·추적성 | partial(휴면 컬럼) | 검증 결과 DB 반영 경로 마련 | 검색·추천에서 `verification_status` 소비, SoT 대시보드 |

## 키 거버넌스 검증 결과 (2026-06-21, Railway production)

`railway run`(로컬)으로 점검한 1차 결과(키 값 비노출). ⚠️ "sealed로 추정"했으나 배포 후 진단에서 **빈 값**으로 확정됨 — 아래 "배포 후 키 검증 확정" 참조.

| 항목 | 결과(1차 추정) |
|------|------|
| 존재 확인(6/7) | 변수 **이름**은 존재(`API_KEY_UNSPLASH`·`API_KEY_F1EC6F97`·`API_KEY_15B51435`·`API_KEY_7CB8F428`·`API_KEY_00412C2B`·`API_KEY_BDA9BE95`). 값은 CLI에 안 보여 sealed로 추정 → **실제로는 빈 값**(배포 진단으로 확정) |
| **카카오 검색 오설정** | 카탈로그 `auth_config.env_var`가 **`API_KEY_KAKAO`** 인데 이 변수는 Railway에 **존재하지 않음** → `API_KEY_F1EC6F97`로 정정 적용 |
| 유효성 미검증(1차) | sealed 추정이라 로컬 검증 불가 → 배포 진단 엔드포인트로 확정 필요(아래) |
| 오펀/중복 변수 | 삭제·비활성 API용 `API_KEY_*` 다수 잔존(예: `_NEWSAPIORG`·`_ODSAY`·`_OPENWEATHERMAP`·`_TAGO`·`_TOURAPI`·`_GEOCODING`·`_ECOS` 등) + ADR식 이름(`DATA_GO_KR_API_KEY`·`KAKAO_REST_API_KEY`·`UNSPLASH_ACCESS_KEY`)과 카탈로그식(`API_KEY_*`) 이름 혼재 |
| **프록시 prefix 미적용(잠재)** | `auth_config`에 `prefix`/`header_prefix`(카카오 `KakaoAK `, Unsplash `Client-ID `)가 선언돼 있으나 프록시 `resolveApiKey`는 이를 **적용하지 않고 raw 값 주입**. env 값에 prefix가 없으면 401. (env 값에 prefix가 포함돼 있으면 정상) — **진단 엔드포인트로 확인 필요** |

> **봉인 키 검증 방법**: `keys:verify` 또는 신규 **관리자 진단 엔드포인트 `GET /api/v1/admin/keys-verify`**(ADMIN_API_KEY 보호)를 *배포 컨텍스트 안*에서 실행. 로컬 `railway run`은 비봉인 변수만 검증 가능.

## 조치 (이 PR, 키 거버넌스)

- **카카오 검색 env_var 수정 적용**: `API_KEY_KAKAO`(미존재) → `API_KEY_F1EC6F97`(카카오 로컬과 동일 키). `scripts/2026-06-21-fix-kakao-search-envvar.sql`
- **관리자 진단 엔드포인트 신설**: `GET /api/v1/admin/keys-verify` — 배포 런타임 env 키로 실제 인증 요청을 보내 6개 sealed 키 유효성 검증. raw 실패 시 prefix 적용 재시도해 **프록시 prefix 미적용 여부(`needsPrefixFix`)** 까지 진단. 로직은 [src/lib/catalog/keyCheck.ts](../../src/lib/catalog/keyCheck.ts)(단위 테스트 12), 라우트 테스트 4.

## 배포 후 키 검증 확정 (2026-06-21, #150 배포 직후)

배포된 `GET /api/v1/admin/keys-verify`를 ADMIN_API_KEY로 호출한 결과(배포 런타임 내부 실행):

> **7개 키 의존 API 전부 `MISSING`** — `summary: { total: 7, valid: 0, invalid: 0, missing: 7 }`

- **근본 원인 확정**: 해당 env 변수들은 **sealed가 아니라 "이름만 있고 값이 빈" 변수**였다. Railway 변수 표시상 값이 공란이고(masked 아님), sealed라면 배포 런타임에 주입돼야 하나 `process.env`에서 미설정으로 읽힘. 앱의 다른 키(`ANTHROPIC_API_KEY`·`NEXT_PUBLIC_SUPABASE_URL`)는 정상 주입 → env 주입 자체는 정상. 카탈로그식(`API_KEY_*`)·ADR식(`DATA_GO_KR_API_KEY` 등) 이름 **양쪽 모두 빈 값**.
- **영향**: 7개 키 의존 API(Unsplash·카카오 로컬/검색·공휴일·기상청 단기/중기·아파트 실거래가)는 키가 없어 사용자 선택 시 401 실패 — 사실상 작동 불가. (NASA=DEMO_KEY, The Cat API=무인증 → 영향 없음)
- **조치 (사용자 승인)**: 7개 `is_active=false` 비활성화. `scripts/2026-06-21-deactivate-empty-key-apis.sql`. **활성 30 → 23**(전부 키 불필요·즉시 사용 가능), 비활성 18 → 25.
- **프록시 prefix 검증 보류**: 키가 비어 있어 `needsPrefixFix` 진단 불가. 실제 키 입력 후 재검증 시 확정.

## 잔여 / 후속 작업

- **🔑 7개 API 재활성화 경로**: 실제 키(data.go.kr·Kakao·Unsplash)를 Railway env(`API_KEY_*`)에 **값까지** 입력 → `is_active=true` 복원 → `GET /api/v1/admin/keys-verify`로 유효성 + 프록시 prefix 적용 여부 확정.
- **🔑 프록시 prefix 적용 수정**: 키 입력 후 진단에서 `needsPrefixFix`가 나오면 프록시 `resolveApiKey`가 `auth_config.prefix`/`header_prefix`를 적용하도록 수정(단, env 값에 이미 prefix가 있으면 이중 적용되므로 진단 결과 확인 후 진행). `prefix`/`header_prefix` 필드명도 단일화.
- **🔑 env 변수 정리**: 비활성/삭제 API용 오펀 `API_KEY_*` 정리, 카카오/Unsplash/data.go.kr 이름 규칙 단일화.
- **`verification_status` 소비(P1)**: ✅ **구현 완료 (2026-06-22, B-2)**. AI 추천(`suggest-apis`)이 broken API를 후보에서 제외하고 verified를 `[검증됨]` 배지로 우선 선택 유도. cron을 `--write`로 전환해 신선도 유지(`SUPABASE_SERVICE_ROLE_KEY` secret 필요 — 미설정 시 read-only degrade). 카탈로그 브라우징은 '가용 유지' 정책상 broken을 숨기지 않음. SoT 대시보드는 후속. 상세: [docs/decisions/2026-06-22-verification-status-consumption.md](2026-06-22-verification-status-consumption.md)
- **라이선스/키 정책**: Open-Meteo 상업 사용 ToS(유료 플랜/셀프호스트), NASA DEMO_KEY→등록 키, data.go.kr 단일키→BYOK/운영계정. (딥리서치 근거)
- **seed.sql 전면 재동기화**: 이번엔 REST Countries·Frankfurter만 정정. 삭제된 API(Open Notify·Free Dictionary·LibreTranslate 등) 잔존 — 별도 작업으로 프로덕션 DB와 전면 동기화 필요.

## 롤백

- REST Countries: `is_active=true, deprecated_at=NULL, verification_status='unverified'`.
- scheduled.yml / 스크립트: git revert.
