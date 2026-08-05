<!-- DOC_STATUS: HISTORICAL | completed: 2026-05-01 | superseded_by: docs/guides/operations.md -->
# 골든셋 API 목록

> ⛔ **2026-05-01 스냅샷 — 현재 상태가 아니다.** 이 문서는 10개를
> `verification_status = 'verified'` 집합이라고 적지만, 번들 시드 기준 실제 `verified`는
> **46개**다(2026-08-06 실측). 활성/검증 상태의 **진실원은 DB**이며 운영 확인은
> `GET /api/v1/admin/catalog-dump` 의 `summary`로 한다 —
> [operations.md §1.4](../guides/operations.md).
> 아래 목록은 **그날 무엇을 왜 골랐는지의 기록**으로만 읽을 것.

검증 날짜: **2026-05-01** (전수 재검증 + 즉시 사용 가능 기준 정리)
검증 방법: 4개 에이전트 병렬 WebFetch/WebSearch + DB 직접 확인

골든셋은 실제 동작이 확인된 API들의 집합입니다.
`verification_status = 'verified'`로 표시되며, AI 코드 생성 시 우선 추천됩니다.

> **2026-05-01 업데이트 (즉시 사용 가능 기준 정리)**: API 키 등록 없이 즉시 사용 가능한 API만 활성 유지.
> TMDB·RAWG → is_active=false (키 등록 필요). The Cat API(auth_type→none 재분류)·NASA DEMO_KEY 신규 추가.
> 전체 정리 내역: [docs/decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md](../decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md)

> **2026-06-21 스냅샷 (역사)**: REST Countries 폐기, 키 미설정 의존 API 비활성화, 당시 활성·키리스 위주 정리.
> ✅ "verified 우선 추천"은 B-2(2026-06-22)로 구현 완료 — `POST /api/v1/suggest-apis`가 `broken` 제외·`verified` 우선.  
> 상세: [docs/decisions/2026-06-22-verification-status-consumption.md](../decisions/2026-06-22-verification-status-consumption.md)

> **현행 헬스·키 검증 (CLI 없음)**: `pnpm catalog:healthcheck` / Supabase cron은 **제거됨**.  
> 대신 배포 런타임 관리자 API: `GET /api/v1/admin/keys-verify`, `POST /api/v1/admin/verify-catalog`,  
> `GET /api/v1/admin/qc-stats` (`ADMIN_API_KEY`). 분류 로직 `src/lib/catalog/healthCheck.ts`, 오케스트레이션 `verifyRunner.ts`.  
> 활성 개수 마케팅 카피 단일 출처: `src/lib/catalog/activeApiCount.ts` (하드코딩 금지).

---

## 검증된 API 목록

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

## 상세 정보

### 1. Random User

- **baseUrl**: `https://randomuser.me`
- **requiresProxy**: false
- **검증 엔드포인트**: `GET /api/`
- **responseDataPath**: `results`
- **응답 구조**: `{ results: [{name, email, picture, location, ...}], info: {...} }`

```js
const res = await fetch('/api/v1/proxy?apiId=6890346f-fa79-483c-bce2-f841ad3420fd&proxyPath=%2Fapi%2F');
const data = await res.json();
const items = data.results; // [{name, email, picture, location, ...}]
```

---

### 2. JSONPlaceholder

- **baseUrl**: `https://jsonplaceholder.typicode.com`
- **requiresProxy**: false
- **검증 엔드포인트**: `GET /posts`, `GET /todos`, `GET /users`
- **responseDataPath**: 없음 (direct array)

```js
const res = await fetch('/api/v1/proxy?apiId=04e79764-c27c-46d8-b63c-2794fbe5a3f7&proxyPath=%2Fposts');
const items = await res.json(); // [{id, userId, title, body}]
```

---

### 3. PokéAPI

- **baseUrl**: `https://pokeapi.co`
- **requiresProxy**: false
- **검증 엔드포인트**: `GET /api/v2/pokemon`
- **responseDataPath**: `results`
- **응답 구조**: `{ count, next, previous, results: [{name, url}] }`

```js
const res = await fetch('/api/v1/proxy?apiId=02cea7ab-d89a-4e51-b9c5-32ed0fd00338&proxyPath=%2Fapi%2Fv2%2Fpokemon');
const data = await res.json();
const items = data.results; // [{name, url}]
```

---

### 4. wheretheiss.at (구: Open Notify)

- **baseUrl**: `https://api.wheretheiss.at`
- **requiresProxy**: true (CORS 미지원)
- **검증 엔드포인트**: `GET /v1/satellites/25544`
- **응답 구조**: `{ latitude, longitude, altitude, velocity, timestamp, ... }`

> Open Notify는 2024년 서비스 종료. 동일 UUID로 wheretheiss.at으로 교체됨.

```js
// ISS 현재 위치
const res = await fetch('/api/v1/proxy?apiId=9a04cd18-15bb-4424-a4f1-10ddf728749b&proxyPath=%2Fv1%2Fsatellites%2F25544');
const data = await res.json();
// data.latitude, data.longitude, data.altitude, data.velocity
```

---

### 5. Hacker News API

- **baseUrl**: `https://hacker-news.firebaseio.com`
- **requiresProxy**: false
- **검증 엔드포인트**: `GET /v0/topstories.json`
- **responseDataPath**: 없음 (integer ID 배열 직접 반환)

```js
const res = await fetch('/api/v1/proxy?apiId=de8f5375-22dc-4573-9a64-2903c150fece&proxyPath=%2Fv0%2Ftopstories.json');
const storyIds = await res.json(); // [integer IDs]
// 개별 기사: /api/v1/proxy?apiId=...&proxyPath=/v0/item/STORY_ID.json
```

---

### 6. Spaceflight News API

- **baseUrl**: `https://api.spaceflightnewsapi.net`
- **requiresProxy**: false
- **검증 엔드포인트**: `GET /v4/articles/`
- **responseDataPath**: `results`
- **응답 구조**: `{ count, next, previous, results: [{id, title, url, imageUrl, newsSite, summary, publishedAt}] }`

```js
const res = await fetch('/api/v1/proxy?apiId=8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7&proxyPath=%2Fv4%2Farticles%2F');
const data = await res.json();
const items = data.results;
```

---

### 7. The Cat API

- **baseUrl**: `https://api.thecatapi.com`
- **authType**: none (키 없이 기본 호출 가능 — 2026-05-01 실측 확인)
- **requiresProxy**: false, **corsSupported**: true
- **rate limit**: 10건/분 (키 없이)
- **검증 엔드포인트**: `GET /v1/images/search`
- **응답 구조**: `[{id, url, width, height}]` (배열 직접 반환)

```js
const res = await fetch('/api/v1/proxy?apiId=f1b6d26f-4cb4-4ea7-844b-8c6ba3b29a8a&proxyPath=%2Fv1%2Fimages%2Fsearch&limit=10');
const images = await res.json(); // [{id, url, width, height}]
```

---

### 8. TheMealDB

- **baseUrl**: `https://www.themealdb.com/api/json/v1/1`
- **authType**: none (키 "1"은 공개 테스트 키)
- **requiresProxy**: false, **corsSupported**: true
- **주의**: 무료 키(v1/1)는 100건 이하·단일 재료 필터·기본 기능만. v2 기능은 Patreon 키 필요.

```js
const res = await fetch('/api/v1/proxy?apiId=da2e14a4-e8c6-4164-835e-6ce8b212d59b&proxyPath=%2Frandom.php');
const data = await res.json();
const meal = data.meals[0]; // {strMeal, strCategory, strInstructions, strMealThumb}
```

---

### 9. The Color API

- **baseUrl**: `https://www.thecolorapi.com`
- **authType**: none
- **requiresProxy**: false, **corsSupported**: true
- **rate limit**: 없음 (공식 명시 없음, 사실상 무제한)

```js
const res = await fetch('/api/v1/proxy?apiId=522f7158-7de0-4447-80bb-ea71a8e56b50&proxyPath=%2Fid&hex=FF5733');
const data = await res.json();
// data.name.value, data.rgb, data.hsl
```

---

### 10. NASA 오늘의 천문 사진

- **baseUrl**: `https://api.nasa.gov`
- **authType**: api_key — **DEMO_KEY 공개 키 사용 (계정 등록 불필요)**
- **requiresProxy**: false, **corsSupported**: true
- **rate limit**: 시간당 30건/IP, 일 50건/IP (DEMO_KEY 기준)
- **검증 엔드포인트**: `GET /planetary/apod`
- **응답 구조**: `{ date, title, explanation, url, hdurl, media_type }`
- **주의**: DEMO_KEY는 auth_config의 default_key로 자동 삽입됨. 신용카드·가입 불필요.

```js
const res = await fetch('/api/v1/proxy?apiId=7b66ab19-4d00-4d39-a4f9-2c2b6c6367a4&proxyPath=%2Fplanetary%2Fapod');
const data = await res.json();
// data.title, data.explanation, data.url (이미지 URL), data.date
```

---

## DB 반영 방법 (현행)

**권장**: 관리자 라이브 검증으로 `verification_status`를 갱신한다.

```bash
# ADMIN_API_KEY 필요
curl -X POST -H "Authorization: Bearer $ADMIN_API_KEY" \
  "https://xzawed.xyz/api/v1/admin/verify-catalog"
```

부팅 시 `ensureCatalogEntries`가 시드 JSON 기준 신규 삽입·키리스 오분류 정정을 멱등으로 수행한다  
([database.md](../architecture/database.md) §부팅).

### 이력 스크립트 (참고만)

Postgres/jsonb 시절 일회성 백필 스크립트(`scripts/backfillGoldenSet.sql`)는 Supabase 제거와 함께 삭제됐다(2026-08-03, C7).  
향후 골든셋 백필이 필요하면 임베디드 SQLite `api_catalog`를 대상으로 새로 작성한다.
