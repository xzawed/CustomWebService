# 골든셋 API 목록

검증 날짜: **2026-04-16**
검증 방법: `scripts/verifyCatalog.ts` 자동 검증 스크립트

골든셋은 실제 HTTP 요청으로 동작이 확인된 API들의 집합입니다.
이 API들은 `verification_status = 'verified'`로 표시되며, AI 코드 생성 시 우선 추천됩니다.

---

## 검증된 API 목록

| # | 이름 | UUID | 카테고리 | 검증 엔드포인트 |
|---|------|------|----------|----------------|
| 1 | Random User | `6890346f-fa79-483c-bce2-f841ad3420fd` | data | GET /api/ |
| 2 | JSONPlaceholder | `04e79764-c27c-46d8-b63c-2794fbe5a3f7` | data | GET /posts, /todos, /users |
| 3 | PokéAPI | `02cea7ab-d89a-4e51-b9c5-32ed0fd00338` | entertainment | GET /api/v2/pokemon |
| 4 | Open Notify (ISS) | `9a04cd18-15bb-4424-a4f1-10ddf728749b` | science | GET /iss-now.json, /astros.json |
| 5 | Hacker News API | `de8f5375-22dc-4573-9a64-2903c150fece` | news | GET /v0/topstories.json |
| 6 | Spaceflight News API | `8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7` | news | GET /v4/articles/ |

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
// /posts
const res = await fetch('/api/v1/proxy?apiId=04e79764-c27c-46d8-b63c-2794fbe5a3f7&proxyPath=%2Fposts');
const items = await res.json(); // [{id, userId, title, body}]

// /todos
const res = await fetch('/api/v1/proxy?apiId=04e79764-c27c-46d8-b63c-2794fbe5a3f7&proxyPath=%2Ftodos');
const items = await res.json(); // [{id, userId, title, completed}]

// /users
const res = await fetch('/api/v1/proxy?apiId=04e79764-c27c-46d8-b63c-2794fbe5a3f7&proxyPath=%2Fusers');
const items = await res.json(); // [{id, name, username, email, address, phone, website, company}]
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

### 4. Open Notify (ISS)

- **baseUrl**: `http://api.open-notify.org`
- **requiresProxy**: true (HTTP only, CORS 없음)
- **검증 엔드포인트**: `GET /iss-now.json`, `GET /astros.json`

```js
// ISS 현재 위치
const res = await fetch('/api/v1/proxy?apiId=9a04cd18-15bb-4424-a4f1-10ddf728749b&proxyPath=%2Fiss-now.json');
const data = await res.json();
// data.iss_position.latitude, data.iss_position.longitude

// 우주 비행사 목록
const res = await fetch('/api/v1/proxy?apiId=9a04cd18-15bb-4424-a4f1-10ddf728749b&proxyPath=%2Fastros.json');
const data = await res.json();
const items = data.people; // [{name, craft}]  ← responseDataPath: "people"
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
const items = data.results; // [{id, title, url, imageUrl, newsSite, summary, publishedAt}]
```

---

## DB 반영 방법

`scripts/backfillGoldenSet.sql`을 Supabase SQL 에디터에서 실행하면
위 6개 API의 `verification_status`, `verified_at`, `last_verification_note`, `endpoints[*].example_call`, `endpoints[*].response_data_path`가 업데이트됩니다.

- SQL은 `jsonb_array_elements` + `CASE WHEN` 패턴으로 기존 endpoint 필드를 보존한 채 새 필드만 병합합니다.
- 엔드포인트 path가 DB에 저장된 값과 다를 경우 해당 UPDATE는 NOOP으로 처리됩니다 (기존 데이터 손실 없음).
- 실행 후 스크립트 말미의 `SELECT` 쿼리로 6개 행의 `verification_status`가 `verified`인지 확인하세요.
