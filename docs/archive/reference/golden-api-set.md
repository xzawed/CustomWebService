<!-- DOC_STATUS: HISTORICAL | completed: 2026-05-01 | superseded_by: docs/guides/operations.md -->
# 골든셋 API 목록

> ⛔ **2026-05-01 스냅샷 — 현재 상태가 아니다.** 이 문서는 10개를
> `verification_status = 'verified'` 집합이라고 적지만, 번들 시드 기준 실제 `verified`는
> **46개**다(2026-08-06 실측). 활성/검증 상태의 **진실원은 DB**이며 운영 확인은
> `GET /api/v1/admin/catalog-dump` 의 `summary`로 한다 —
> [operations.md §1.4](../../guides/operations.md).
> 아래 목록은 **그날 무엇을 왜 골랐는지의 기록**으로만 읽을 것.

검증 날짜: **2026-05-01** (전수 재검증 + 즉시 사용 가능 기준 정리)
검증 방법: 4개 에이전트 병렬 WebFetch/WebSearch + DB 직접 확인

골든셋은 실제 동작이 확인된 API들의 집합입니다.
`verification_status = 'verified'`로 표시되며, AI 코드 생성 시 우선 추천됩니다.

> **2026-05-01 업데이트 (즉시 사용 가능 기준 정리)**: API 키 등록 없이 즉시 사용 가능한 API만 활성 유지.
> TMDB·RAWG → is_active=false (키 등록 필요). The Cat API(auth_type→none 재분류)·NASA DEMO_KEY 신규 추가.
> 전체 정리 내역: [docs/decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md](../../decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md)

> **2026-06-21 스냅샷 (역사)**: REST Countries 폐기, 키 미설정 의존 API 비활성화, 당시 활성·키리스 위주 정리.
> ✅ "verified 우선 추천"은 B-2(2026-06-22)로 구현 완료 — `POST /api/v1/suggest-apis`가 `broken` 제외·`verified` 우선.  
> 상세: [docs/decisions/2026-06-22-verification-status-consumption.md](../../decisions/2026-06-22-verification-status-consumption.md)

> **현행 헬스·키 검증 (CLI 없음)**: `pnpm catalog:healthcheck` / Supabase cron은 **제거됨**.  
> 대신 배포 런타임 관리자 API: `GET /api/v1/admin/keys-verify`, `POST /api/v1/admin/verify-catalog`,  
> `GET /api/v1/admin/qc-stats` (`ADMIN_API_KEY`). 분류 로직 `src/lib/catalog/healthCheck.ts`, 오케스트레이션 `verifyRunner.ts`.  
> 활성 개수 마케팅 카피 단일 출처: `src/lib/catalog/activeApiCount.ts` (하드코딩 금지).

---

## 그날 고른 10개 (2026-05-01)

| # | 이름 | UUID | 카테고리 | 검증 엔드포인트 |
|---|------|------|----------|----------------|
| 1 | Random User | `6890346f-fa79-483c-bce2-f841ad3420fd` | data | GET /api/ |
| 2 | JSONPlaceholder | `04e79764-c27c-46d8-b63c-2794fbe5a3f7` | data | GET /posts, /todos, /users |
| 3 | PokéAPI | `02cea7ab-d89a-4e51-b9c5-32ed0fd00338` | entertainment | GET /api/v2/pokemon |
| 4 | wheretheiss.at | `9a04cd18-15bb-4424-a4f1-10ddf728749b` | utility | GET /v1/satellites/25544 |
| 5 | Hacker News API | `de8f5375-22dc-4573-9a64-2903c150fece` | news | GET /v0/topstories.json |
| 6 | Spaceflight News API | `8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7` | news | GET /v4/articles/ |
| 7 | The Cat API | `f1b6d26f-4cb4-4ea7-844b-8c6ba3b29a8a` | image | GET /v1/images/search |
| 8 | TheMealDB | `da2e14a4-e8c6-4164-835e-6ce8b212d59b` | fun | GET /random.php |
| 9 | The Color API | `522f7158-7de0-4447-80bb-ea71a8e56b50` | utility | GET /id?hex=FF5733 |
| 10 | NASA 오늘의 천문 사진 | `7b66ab19-4d00-4d39-a4f9-2c2b6c6367a4` | image | GET /planetary/apod |

---

## 호출 상세는 카탈로그에 있다 (사본 삭제, 2026-08-07)

`baseUrl`·`requiresProxy`·`corsSupported`·rate limit·응답 데이터 경로·fetch 예시는
**전부 `src/data/apiCatalog.json` 안에 있다** — 예시 코드는 `endpoints[].exampleCall`,
데이터 경로는 `endpoints[].responseDataPath` 필드다. 여기 있던 사본은 2026-05-01 시점 값이라
카탈로그와 어긋나기만 했고, **AI 생성이 실제로 읽는 것도 카탈로그이지 이 문서가 아니다.**

```bash
node -e "const c=require('./src/data/apiCatalog.json');
console.log(JSON.stringify(c.find(x => x.id === '위 표의 UUID'), null, 2))"
```

명령으로 복원되지 않는 두 가지만 남긴다.

- **wheretheiss.at은 Open Notify의 UUID를 물려받았다.** Open Notify가 2024년 종료되어
  `9a04cd18-…` **행의 내용만 교체**했다. UUID가 같다고 같은 업스트림이라고 단정하지 말 것.
- **NASA DEMO_KEY 한도**(2026-05-01 문서 기준): 시간당 30건/IP · **일 50건/IP**.
  카탈로그 `rate_limit` 에는 `"30"` 만 들어 있어 **일 한도는 이 줄에만 있다.**

---

## DB 반영 방법 (현행)

**권장**: 관리자 라이브 검증으로 `verification_status`를 갱신한다.

```bash
# ADMIN_API_KEY 필요
curl -X POST -H "Authorization: Bearer $ADMIN_API_KEY" \
  "https://xzawed.xyz/api/v1/admin/verify-catalog"
```

부팅 시 `ensureCatalogEntries`가 시드 JSON 기준 신규 삽입·키리스 오분류 정정을 멱등으로 수행한다  
([database.md](../../architecture/database.md) §부팅).

### 이력 스크립트 (참고만)

Postgres/jsonb 시절 일회성 백필 스크립트(`scripts/backfillGoldenSet.sql`)는 Supabase 제거와 함께 삭제됐다(2026-08-03, C7).  
향후 골든셋 백필이 필요하면 임베디드 SQLite `api_catalog`를 대상으로 새로 작성한다.
