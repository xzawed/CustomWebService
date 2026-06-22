# 카탈로그 등록(B-3 완료) & seed.sql 전면 재동기화(B-5) — ADR

- 날짜: 2026-06-22
- 상태: 완료 (프로덕션 반영 + seed.sql 커밋)
- 배경: 2026-06-22 잔여작업 핸드오프의 후속 항목 B-3(마지막 단계)·B-5 처리.
- 선행:
  - [2026-06-22-country-data-api-design.md](../superpowers/specs/2026-06-22-country-data-api-design.md) (B-3 설계)
  - [2026-06-22-verification-status-consumption.md](2026-06-22-verification-status-consumption.md) (B-2)
  - [2026-06-21-api-catalog-health-monitoring.md](2026-06-21-api-catalog-health-monitoring.md) (REST Countries 폐기)

## 1. B-3 카탈로그 등록 (완료)

자체 호스팅 국가 데이터 API(`/api/v1/countries`·`/api/v1/countries/[code]`, PR #158로 배포 라이브)를
프로덕션 `api_catalog`에 등록했다. 배포가 라이브여야 헬스체크가 200을 받으므로 **배포 후 단계**였다.

### 등록된 row
- name `Countries (Self-hosted)`, category `data`, base_url `https://xzawed.xyz`
- auth_type `none`, requires_proxy `false`, cors_supported `true`
- verification_status `verified`, is_active `true`, cache_ttl_seconds `86400`
- tags `{data,countries,geography,free,no-auth}`
- endpoints:
  - `/api/v1/countries` (전체 목록, region·search 필터)
  - **`/api/v1/countries/KR`** — 코드 조회 엔드포인트를 `{code}` 플레이스홀더 대신 **구체 예시 `KR`로 등록**.
    헬스체크(`src/lib/catalog/healthCheck.ts`)가 `{code}`를 `sampleFor`로 `'test'`로 채워
    `/api/v1/countries/test` → 404(`unknown` 분류)를 만들기 때문. `KR`은 실제 200 → `working`.

### REST Countries 후속 연결
- 폐기된 `REST Countries` row(`is_active=false`, `verification_status=broken`, `deprecated_at` 설정됨)의
  `successor_id`를 신규 Countries row로 연결.

### 검증
- 라이브 응답: `GET /api/v1/countries` → 200 + bare array(250개), `GET /api/v1/countries/KR` → 200 + bare object.
  두 응답 모두 `looksLikeErrorBody`에 걸리지 않아(배열 단락·`error`/`status` 필드 없음) 다음 cron에서 `working` 확정.
- 등록 후 프로덕션 `api_catalog`: **활성 24개**(키리스 23 + Countries), 비활성 25개.

## 2. B-5 seed.sql 전면 재동기화 (완료)

`supabase/seed.sql`이 프로덕션 `api_catalog`와 크게 어긋나 있었다(신규 환경 시드 시 폐기 API 재유입 위험).

### 어긋남 규모 (재동기화 전)
- seed.sql에만 존재(프로덕션에서 제거됨): CoinGecko·CoinDesk·SpaceX·Bored·Agify·Genderize·
  Nationalize·Quotable·Cat Facts·Numbers·Open Notify·IP-API·BigDataCloud·**Free Dictionary·LibreTranslate**·
  NewsAPI·ODsay·네이버 지도 등 ~18개. (일부는 **활성으로** 시드되어 죽은 API가 재유입됨)
- 프로덕션에만 존재(seed.sql 누락): The Color API·TheMealDB·wheretheiss.at·ZenQuotes·Countries(Self-hosted)·
  RAWG·TMDB·카카오 검색·식약처·국토부 아파트 전월세·HIRA·KOPIS·NEIS 등 ~13개.
- `is_active`/`description`/`rate_limit`/`auth_config(env_var)`/`endpoints(example_call)` 다수 불일치.

### 방식 — 프로덕션 미러 생성
- 프로덕션 `api_catalog`를 PostgreSQL **`format()`/`quote_literal()`로 덤프**해 seed.sql을 재생성(전사 자동화).
  손으로 옮기지 않아 이스케이프/전사 오류가 원천 차단됨.
- 출력: **49개 INSERT**(프로덕션 49행과 1:1), category 순·활성 우선 정렬, 각 INSERT 위에 `[active=...]` 주석.
- REST Countries 후속 연결은 생성된 UUID라 **이름 기준 `UPDATE`**로 말미에 처리.
- feature_flags 블록·`DELETE` 패턴은 기존 그대로 보존.

### 검증
- 49개 INSERT 전부 `);` 종료, 태그 `ARRAY[]` 49개.
- 파일 내 **81개 `::jsonb` 리터럴을 SQL 리터럴 토크나이저(`''` 이스케이프 처리)로 추출 → 전부 `json.loads` 통과(0 invalid)**.
  (apostrophe 포함 JS 예시 코드 때문에 `''` 48개 존재 — `quote_literal`이 정상 이스케이프한 것)

### 재동기화 방법 (향후)
- 준-정적이므로 드리프트 시 동일 `format()` 덤프로 재생성한다. seed.sql은 **프로덕션 미러**이며 손편집 대상이 아니다.

## 미결 (사용자 액션·판단 필요)

- **B-2 secret (사용자 액션)**: `SUPABASE_SERVICE_ROLE_KEY`가 GitHub Actions secret에 **없음**(확인됨).
  없으면 cron `catalog:healthcheck:write`가 read-only로 degrade → `verification_status` 미갱신(stale).
  `gh secret set SUPABASE_SERVICE_ROLE_KEY`로 Railway 값 입력 필요(키 값은 사용자만 접근 가능).
## 추가 처리 — Lorem Picsum 비활성화 (2026-06-22)

picsum.photos가 2026-06-21부터 Cloudflare 522/timeout 지속(24h+). 프로덕션에서 `unverified`+active라
AI가 다운된 API를 계속 추천 중이었고, B-2 secret 부재로 cron이 `broken` 표기도 못 하는 상태였다.
핸드오프 임계값(24~48h) 도달 → **사용자 결정으로 즉시 비활성화**.
- 프로덕션 `api_catalog`: `Lorem Picsum` → `is_active=false`, `verification_status='broken'`,
  `last_verification_note`에 사유·날짜 기록. **`deprecated_at`은 미설정**(영구 폐기가 아닌 일시 장애).
- 활성 카탈로그 **24 → 23**. seed.sql도 동일하게 `is_active=false`로 반영(미러 정합성).
- 복구 시 재검증 후 `is_active=true` 복원.
