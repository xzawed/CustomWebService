# API v1 엔드포인트 레퍼런스

> **Base URL (개발):** http://localhost:3000/api/v1  
> **Base URL (프로덕션):** https://xzawed.xyz/api/v1  
> **인증:** Supabase 세션 쿠키 필요 (공개 엔드포인트 표시됨)

---

## Base URL
```
개발: http://localhost:3000/api/v1
프로덕션: https://<railway-domain>/api/v1
```

## 공통 응답 형식
```typescript
// 성공
{
    "success": true,
    "data": T,
    "message": "성공 메시지"
}

// 실패
{
    "success": false,
    "error": {
        "code": "ERROR_CODE",
        "message": "에러 메시지"
    }
}
```

---

## 1. API 카탈로그 (Catalog)

### GET /api/v1/catalog
API 카탈로그 전체 조회

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| category | string | N | 카테고리 필터 |
| search | string | N | 검색어 |
| page | number | N | 페이지 (기본 1) |
| limit | number | N | 페이지 크기 (기본 20) |

**Response:**
```json
{
    "success": true,
    "data": {
        "items": [
            {
                "id": "uuid",
                "name": "OpenWeatherMap",
                "description": "현재 날씨, 5일 예보, 대기질",
                "category": "weather",
                "baseUrl": "https://api.openweathermap.org",
                "authType": "api_key",
                "rateLimit": "1000/day",
                "isActive": true,
                "iconUrl": "/icons/openweathermap.svg",
                "docsUrl": "https://openweathermap.org/api",
                "endpoints": [...],
                "tags": ["weather", "forecast"]
            }
        ],
        "total": 30,
        "page": 1,
        "totalPages": 2
    }
}
```

### GET /api/v1/catalog/:id
특정 API 상세 조회

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "name": "OpenWeatherMap",
        "description": "현재 날씨, 5일 예보, 대기질",
        "category": "weather",
        "baseUrl": "https://api.openweathermap.org",
        "authType": "api_key",
        "creditRequired": null,
        "endpoints": [...]
    }
}
```

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 |
| 404 | 해당 ID의 API를 찾을 수 없음 |

### GET /api/v1/catalog/categories
카테고리 목록 조회

**Response:**
```json
{
    "success": true,
    "data": [
        { "key": "weather", "label": "날씨", "count": 3, "icon": "🌤" },
        { "key": "news", "label": "뉴스", "count": 3, "icon": "📰" },
        { "key": "finance", "label": "금융/환율", "count": 3, "icon": "💱" }
    ]
}
```

---

## 2. 프로젝트 (Projects)

### POST /api/v1/projects
새 프로젝트 생성

**Request Body:**
```json
{
    "name": "여행자 환율 계산기",
    "context": "여행자를 위한 환율 계산기를 만들고 싶어요...",
    "apiIds": ["uuid-1", "uuid-2"]
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "project-uuid",
        "name": "여행자 환율 계산기",
        "status": "draft",
        "apis": [...],
        "createdAt": "2026-03-20T00:00:00Z"
    }
}
```

### GET /api/v1/projects
내 프로젝트 목록 조회

### GET /api/v1/projects/:id
프로젝트 상세 조회

### DELETE /api/v1/projects/:id
프로젝트 삭제

### POST /api/v1/projects/:id/rollback
특정 버전으로 롤백 (기존 버전의 코드를 새 버전으로 복사)

**Request Body:**
```json
{
    "version": 2
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "projectId": "uuid",
        "version": 3,
        "rolledBackFrom": 2
    }
}
```

### POST /api/v1/projects/:id/publish
생성된 서비스를 서브도메인으로 게시

> 최초 게시 시 `slug`를 직접 지정할 수 있습니다. 미제공 시 자동 생성됩니다. 재게시는 기존 slug를 유지합니다.

**Request Body (선택):**
```json
{
    "slug": "my-weather-app"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `slug` | string | N | 최초 게시 시 사용할 slug. 미제공 시 AI 추천 또는 자동 생성. 충돌 시 `-2`, `-3` suffix 자동 부여 |

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "status": "published",
        "slug": "my-weather-app",
        "publishedAt": "2026-03-28T00:00:00Z"
    }
}
```

### POST /api/v1/projects/:id/slug/check
slug 가용성 실시간 검증 (PublishDialog에서 커스텀 입력 시 사용)

**Request Body:**
```json
{
    "slug": "my-weather-app"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "available": true
    }
}
```

사용 불가한 경우:
```json
{
    "success": true,
    "data": {
        "available": false,
        "reason": "taken"
    }
}
```

| `reason` 값 | 설명 |
|-------------|------|
| `invalid` | 형식 오류 (길이, 문자, 예약어) |
| `reserved` | 시스템 예약 slug |
| `taken` | 다른 프로젝트가 사용 중 |

| 상태 코드 | 설명 |
|-----------|------|
| 200 | 검증 완료 (available true/false) |
| 400 | 요청 형식 오류 |
| 401 | 미인증 |
| 403 | 프로젝트 소유자가 아님 |

---

### DELETE /api/v1/projects/:id/publish
게시 취소 (서비스를 비공개로 전환)

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "status": "unpublished"
    }
}
```

---

## 3. 코드 생성 (Generate)

### POST /api/v1/generate
웹서비스 코드 생성 요청

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "templateId": "dashboard"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `projectId` | string | Y | 생성 대상 프로젝트 UUID |
| `templateId` | string | N | 템플릿 ID (없으면 기존 categoryDesignMap 동작 유지) |

**templateId 값:** `dashboard` \| `calculator` \| `gallery` \| `info-lookup` \| `map-service` \| `content-feed` \| `comparison` \| `timeline` \| `news-curator` \| `quiz` \| `profile`

**Response (SSE - Server-Sent Events):**
```
event: progress
data: {"progress": 10, "message": "API 분석 중..."}

event: progress
data: {"progress": 30, "message": "코드 생성 중..."}

event: progress
data: {"progress": 70, "message": "코드 파싱 중..."}

event: progress
data: {"progress": 90, "message": "코드 검증 중..."}

event: complete
data: {"projectId": "uuid", "version": 1, "previewUrl": "/api/v1/preview/uuid"}

event: error
data: {"message": "코드 생성에 실패했습니다."}
```

### GET /api/v1/generate/status/:projectId
생성 진행 상태 조회 (모바일 백그라운드 폴링용)

**Auth:** 필수

> SSE 스트림이 끊겼을 때(모바일 탭 전환 등) 클라이언트가 1초 간격으로 폴링하여 생성 완료를 확인합니다.

**Response:**
```json
{
    "success": true,
    "data": {
        "status": "generating",
        "progress": 45,
        "message": "Stage 2 기능 검증 중..."
    }
}
```

완료 시:
```json
{
    "success": true,
    "data": {
        "status": "completed",
        "result": { "projectId": "uuid", "version": 1 }
    }
}
```

| `status` 값 | 설명 |
|-------------|------|
| `generating` | 진행 중 (progress, message 포함) |
| `completed` | 완료 (result.version 포함) |
| `failed` | 실패 (error 메시지 포함) |
| `unknown` | 해당 프로젝트 생성 기록 없음 |

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 |
| 401 | 인증 필요 |

---

### POST /api/v1/generate/regenerate
코드 재생성 (수정 요청)

**Auth:** 필수

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "feedback": "색상을 더 밝게 해주세요. 그래프도 추가해주세요."
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `projectId` | string | Y | 재생성 대상 프로젝트 UUID |
| `feedback` | string | Y | 수정 요청 내용 (1~5,000자) |

**Response (SSE):**
```
event: progress
data: {"progress": 10, "message": "피드백 분석 중..."}

event: progress
data: {"progress": 30, "message": "코드 수정 중..."}

event: complete
data: {"projectId": "uuid", "version": 2, "previewUrl": "/api/v1/preview/uuid"}

event: error
data: {"message": "재생성에 실패했습니다."}
```

> 프로젝트당 최대 `maxRegenerationsPerProject`(기본 5회) 재생성 가능. 재생성도 일일 생성 횟수에 포함됩니다.

### POST /api/v1/suggest-context
선택된 API 기반 AI 서비스 아이디어 추천

> 빌더 스텝 1(API 선택) → 스텝 2(서비스 설명) 전환 시 자동 호출

**Auth:** 필수

**Request Body:**
```json
{
    "apis": [
        {
            "name": "OpenWeatherMap",
            "description": "현재 날씨, 5일 예보, 대기질",
            "category": "weather"
        }
    ]
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "suggestions": [
            "실시간 날씨 대시보드를 만들고 싶어요. 현재 기온, 습도, 풍속을 시각적으로 보여주고...",
            "여행지별 날씨를 한눈에 비교할 수 있는 앱을 만들어 주세요...",
            "미세먼지와 자외선 지수를 함께 보여주는 오늘의 외출 도우미..."
        ]
    }
}
```

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (파싱 실패 시에도 200 + suggestions: []) |
| 400 | apis 누락 또는 잘못된 형식 |
| 401 | 인증 필요 |

---

## 4. 미리보기 (Preview)

### GET /api/v1/preview/:projectId
생성된 코드 미리보기용 HTML 반환

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| version | number | N | 코드 버전 (기본 최신, 1 이상의 정수) |

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (text/html) |
| 400 | version 파라미터가 1 미만이거나 정수가 아님 |
| 401 | 인증 필요 |
| 404 | 프로젝트 또는 코드 없음 |

---

## 5. 배포 (Deploy)

### POST /api/v1/deploy
생성된 서비스 배포

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "platform": "railway",
    "version": 1
}
```

**Response (SSE):**
```
event: progress
data: {"progress": 10, "message": "GitHub 저장소 생성 중..."}

event: progress
data: {"progress": 50, "message": "코드 업로드 중..."}

event: progress
data: {"progress": 80, "message": "배포 중..."}

event: complete
data: {"projectId": "uuid", "deployUrl": "https://svc-abc12345.up.railway.app", "repoUrl": "https://github.com/...", "platform": "railway"}

event: error
data: {"message": "배포에 실패했습니다."}
```

> **Rate Limit**: 사용자당 일일 `MAX_DEPLOY_PER_DAY`회 (기본 5회). 초과 시 429 `RATE_LIMITED` 반환.

> **참고**: `GET /api/v1/deploy/:projectId/status`는 미구현 상태입니다. 프로젝트 상태는 `GET /api/v1/projects/:id`로 확인하세요.

---

## 6. 공개 사이트 서빙 (Public Site)

### GET /site/:slug
게시된 서비스를 공개 URL로 서빙

> **인증 불필요** — 누구나 접근 가능한 공개 엔드포인트

**URL 구조:** `https://<app-domain>/site/<slug>`

**동작:**
- slug 유효성 검사 → 예약어 차단
- 프로젝트 조회 → `published` 상태 확인
- 최신 생성 코드를 완성된 HTML로 조합하여 반환
- 미게시 상태면 "준비 중" 안내 페이지 반환 (HTTP 200)
- 존재하지 않는 slug는 404 페이지 반환

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (게시된 사이트 HTML) |
| 200 | 미게시 상태 ("준비 중" 안내 페이지) |
| 400 | 잘못된 slug 형식 (예약어·빈 slug 등) |
| 404 | 해당 slug의 프로젝트 없음 |

**Response:** `text/html` (완성된 웹 애플리케이션)

**Response Headers:**
```
Content-Type: text/html; charset=utf-8
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
Content-Security-Policy: (허용된 외부 스크립트/스타일만)
X-Frame-Options: DENY
```

---

## 7. 헬스체크 (Health)

### GET /api/v1/health
서비스 상태 및 한도 사용률 조회

> **인증 불필요** — 모니터링 용도

**Response:**
```json
{
    "status": "healthy",
    "timestamp": "2026-03-28T00:00:00Z",
    "checks": {
        "database": "ok",
        "ai": "ok",
        "deploy": "ok"
    },
    "usage": {
        "todayGenerations": 42,
        "totalProjects": 150,
        "totalUsers": 30,
        "limits": {
            "maxDailyGenerationsPerUser": 10,
            "maxApisPerProject": 5,
            "maxProjectsPerUser": 20
        }
    }
}
```

**status 값:**
- `healthy`: 모든 서비스 정상
- `degraded`: AI 또는 배포 서비스 미설정 (환경변수 누락)
- `unhealthy`: 데이터베이스 연결 실패

---

## 8. 인증 (Auth)

Supabase Auth 사용 - 별도 API 구현 불필요

| 기능 | 방식 |
|------|------|
| 소셜 로그인 | Google, GitHub OAuth (`signInWithOAuth()`) |
| OAuth 콜백 | 서버사이드 Route Handler (`/callback` → PKCE 코드 교환) |
| 사용자 레코드 생성 | 첫 로그인 시 `callback/route.ts`에서 `users` 테이블에 자동 생성 (`id = auth.uid()`) |
| 로그아웃 | Supabase `signOut()` |
| 세션 관리 | Supabase 자동 관리 (미들웨어에서 쿠키 갱신) |

---

## 9. 에러 코드

| 코드 | HTTP Status | 설명 |
|------|-------------|------|
| AUTH_REQUIRED | 401 | 인증 필요 |
| FORBIDDEN | 403 | 권한 없음 |
| NOT_FOUND | 404 | 리소스 없음 |
| INVALID_INPUT | 400 | 입력값 오류 (Zod 스키마 검증 실패 포함) |
| CONTEXT_TOO_SHORT | 400 | 컨텍스트 50자 미만 |
| CONTEXT_TOO_LONG | 400 | 컨텍스트 2000자 초과 |
| MAX_APIS_EXCEEDED | 400 | API 최대 선택 수 초과 |
| GENERATION_FAILED | 500 | 코드 생성 실패 |
| DEPLOY_FAILED | 500 | 배포 실패 |
| RATE_LIMITED | 429 | 요청 횟수 초과 |
| INTERNAL_ERROR | 500 | 처리되지 않은 서버 오류 |

> **참고**: Zod 스키마 검증 실패(`ZodError`)는 `INVALID_INPUT` 코드로 400 응답을 반환합니다.
> `handleApiError()` 유틸리티가 `AppError`, `ZodError`, 일반 `Error` 모두를 표준 형식으로 변환합니다.

---

## 10. 갤러리 (Gallery)

### GET /api/v1/gallery
공개 갤러리 목록 조회

**Auth required**: No (인증 없이도 조회 가능, 인증 시 좋아요 상태 포함)

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| page | number | N | 페이지 번호 (기본 1) |
| pageSize | number | N | 페이지 크기 (기본 12, 최대 50) |
| category | string | N | 카테고리 필터 |
| sortBy | string | N | 정렬 기준 (`popular` 또는 `newest`, 기본 `newest`) |
| search | string | N | 검색어 (최대 200자) |

### POST /api/v1/gallery/:id/like
갤러리 항목 좋아요

**Auth required**: Yes

### DELETE /api/v1/gallery/:id/like
갤러리 항목 좋아요 취소

**Auth required**: Yes

### POST /api/v1/gallery/:id/fork
갤러리 항목 포크 (내 프로젝트로 복사)

**Auth required**: Yes

**Response (201 Created):**
```json
{
    "success": true,
    "data": { ... }
}
```

---

## 11. AI 추천 (Suggest)

### POST /api/v1/suggest-apis
서비스 설명 기반 API 추천

**Auth required**: Yes

**Request Body:**
```json
{
    "context": "만들고 싶은 서비스 설명 (50~2000자)"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "recommendations": [
            {
                "api": { "id": "uuid", "name": "OpenWeatherMap", ... },
                "reason": "날씨 데이터 제공에 최적"
            }
        ]
    }
}
```

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (파싱 실패 시에도 200 + recommendations: []) |
| 400 | context 누락 또는 길이 제한 위반 |
| 401 | 인증 필요 |
| 429 | 일일 한도 초과 |

### POST /api/v1/suggest-modification
기존 프로젝트 수정 아이디어 추천

**Auth required**: Yes

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "prompt": "부분적인 수정 방향 힌트 (선택, 최대 500자)"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "suggestions": [
            "UI 개선 제안...",
            "기능 추가 제안...",
            "데이터 시각화 제안..."
        ]
    }
}
```

---

## 12. 인기 서비스 (Popular Services)

### GET /api/v1/popular-services
인기 서비스 템플릿 목록 조회 (실사용 데이터 기반 + 큐레이션 폴백)

**Auth required**: Yes

**Response:**
```json
{
    "success": true,
    "data": {
        "services": [
            {
                "id": "popular-uuid",
                "title": "실시간 날씨 대시보드",
                "description": "...",
                "context": "...",
                "apiNames": ["OpenWeatherMap"],
                "apiIds": ["uuid"],
                "category": "weather",
                "usageCount": 42
            }
        ],
        "source": "usage"
    }
}
```

`source` 값: `usage` (실사용 데이터) | `mixed` (실사용 + 큐레이션 혼합)

---

## 13. 사용자 API 키 (User API Keys)

### GET /api/v1/user-api-keys
내 API 키 목록 조회 (마스킹 처리)

**Auth required**: Yes

### POST /api/v1/user-api-keys
API 키 저장 (신규 등록 또는 업데이트)

**Auth required**: Yes

**Request Body:**
```json
{
    "apiId": "uuid",
    "apiKey": "your-api-key"
}
```

### DELETE /api/v1/user-api-keys?apiId=:apiId
API 키 삭제

**Auth required**: Yes

---

## 14. 외부 API 프록시 (Proxy)

### GET /api/v1/proxy
### POST /api/v1/proxy

생성된 웹서비스가 외부 API를 호출할 때 CORS 우회 및 API 키 주입을 위한 서버사이드 프록시

> **보안:** SSRF 방지를 위해 등록된 `baseUrl` 범위 내에서만 요청 허용. 사설 IP 및 루프백 주소 차단.

**Auth required**: Yes (`getAuthUser()` — 미인증 시 401 반환)

**Rate Limit**: 사용자당 분당 60회 (인메모리, 초과 시 429)

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| apiId | string (UUID) | Y | 카탈로그 API ID |
| proxyPath | string | Y | 대상 API 경로 (예: `/weather?q=Seoul`) |
| projectId | string (UUID) | N | 프로젝트 ID (사용자 개인 키 조회용) |

---

## 15. 관리자 API (Admin)

> `ADMIN_API_KEY` 헤더(`X-Admin-Key`) 필수. 일반 사용자 접근 불가.

### GET /api/v1/admin/qc-stats
QC 통계 조회

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| days | number | N | 조회 기간 (기본 7일) |

**Response:**
```json
{
    "success": true,
    "data": {
        "period": { "from": "2026-04-05", "to": "2026-04-12", "days": 7 },
        "totalGenerations": 150,
        "avgStructuralScore": 8.5,
        "avgMobileScore": 7.2,
        "avgRenderingQcScore": 6.8,
        "qcPassRate": 0.85,
        "qualityLoopUsageRate": 0.32,
        "deepQcFailedCount": 5,
        "commonFailures": [
            { "check": "contrast", "failCount": 12, "rate": 0.08 }
        ]
    }
}
```

### POST /api/v1/admin/trigger-qc
특정 프로젝트에 대한 수동 QC 실행 (`ENABLE_RENDERING_QC=true` 필요)

**Request Body:**
```json
{
    "projectId": "project-uuid"
}
```

**에러 응답 형식:** 표준 `{ success: false, error: { code, message } }`

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `QC_DISABLED` | 400 | `ENABLE_RENDERING_QC`가 활성화되지 않음 |
| `NOT_FOUND` | 404 | 해당 프로젝트의 생성된 코드 없음 |
| `INVALID_INPUT` | 400 | `projectId` 누락 |
