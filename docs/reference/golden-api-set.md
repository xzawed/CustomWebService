# 골든셋 API 목록

검증 날짜: **2026-05-01** (전수 재검증 + 즉시 사용 가능 기준 정리)
검증 방법: 4개 에이전트 병렬 WebFetch/WebSearch + DB 직접 확인

골든셋은 실제 동작이 확인된 API들의 집합입니다.
`verification_status = 'verified'`로 표시되며, AI 코드 생성 시 우선 추천됩니다.

> **2026-05-01 업데이트 (즉시 사용 가능 기준 정리)**: API 키 등록 없이 즉시 사용 가능한 API만 활성 유지.
> TMDB·RAWG → is_active=false (키 등록 필요). The Cat API(auth_type→none 재분류)·NASA DEMO_KEY 신규 추가.
> 전체 정리 내역: [docs/decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md](../decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md)

> **2026-06-21 업데이트**: 카탈로그 전체에 대한 **DB 기반 일일 헬스체크**(`pnpm catalog:healthcheck`)가 도입됨. 라이브 검증 + 배포 런타임 키 검증(`/admin/keys-verify`) 결과:
> - REST Countries(v3.1 deprecated) 폐기
> - 키 의존 7개(Unsplash·카카오 로컬/검색·공휴일·기상청 단기/중기·아파트 실거래가) — Railway env 키가 **빈 값(미설정)** 으로 확인되어 **비활성화**
> - **현재 활성 23개**(전부 키 불필요·즉시 사용 가능): broken 0 · degraded 2(NASA·wheretheiss 지연) · 나머지 정상
> ✅ "verified 우선 추천"은 **B-2(2026-06-22)로 구현 완료** — AI 추천(`POST /api/v1/suggest-apis`)이 `verification_status==='broken'` API를 후보에서 제외하고 `verified`에는 `[검증됨]` 배지로 우선 선택을 유도한다. 상세: [docs/decisions/2026-06-22-verification-status-consumption.md](../decisions/2026-06-22-verification-status-consumption.md)

> **2026-06-25 주석**: 위 2026-06-21 메모의 `pnpm catalog:healthcheck` CLI와 Supabase cron은 SQLite 컷오버(P8.2)로 제거됨 — 헬스 모니터링은 배포 런타임 엔드포인트(`/api/v1/admin/qc-stats`·`keys-verify`)와 `ensureCatalog.ts` 멱등 정정으로 대체. 활성 API 수는 무료·키리스 12종 추가(#169) 후 증가했으며 정확한 수치는 `activeApiCount.ts`(동적 카운트)가 단일 출처.

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

## DB 반영 방법

`scripts/backfillGoldenSet.sql`을 Supabase SQL 에디터에서 실행하면
위 API들의 `verification_status`, `verified_at`, `last_verification_note` 등이 업데이트됩니다.

- SQL은 `jsonb_array_elements` + `CASE WHEN` 패턴으로 기존 endpoint 필드를 보존한 채 새 필드만 병합합니다.
- 엔드포인트 path가 DB에 저장된 값과 다를 경우 해당 UPDATE는 NOOP으로 처리됩니다 (기존 데이터 손실 없음).
- 실행 후 스크립트 말미의 `SELECT` 쿼리로 `verification_status`가 `verified`인지 확인하세요.
